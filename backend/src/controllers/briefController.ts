import { Request, Response } from 'express';
import { getRepoStructure } from '../services/githubService';
import Groq from 'groq-sdk';
import pool from '../db/connection';
import { RowDataPacket } from 'mysql2';
import { parseModelJson } from '../utils/jsonParse';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'tar', 'gz', 'rar',
  'exe', 'dll', 'so', 'dylib', 'wasm',
  'mp3', 'mp4', 'avi', 'mov', 'mkv',
  '.map', 'lock'
]);

const LOCK_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'poetry.lock', 'Cargo.lock', 'Gemfile.lock', 'composer.lock'
]);

function scoreFile(path: string): number {
  const name = path.split('/').pop() || '';
  const lower = name.toLowerCase();
  const ext = path.split('.').pop()?.toLowerCase() || '';

  if (BINARY_EXTENSIONS.has(ext) || LOCK_FILES.has(name)) return -1;
  if (name.match(/^\./)) return -1;

  if (/^readme\.(md|rst|txt)$/i.test(name)) return 10;
  if (/^(main|app|server|index)\.(ts|js|py|go|rs)$/.test(lower)) return 9;
  if (/^schema\.(sql|prisma)$/i.test(name) || /^(models|types|interfaces|entities)/.test(name)) return 8;
  if (/^(routes|router|api|endpoints|urls)\./.test(lower) || path.includes('/routes/')) return 7;
  if (/^package\.json$/i.test(name) || /^requirements\.txt$/i.test(name) || /^pyproject\.toml$/i.test(name) || /^go\.mod$/i.test(name) || /^Cargo\.toml$/i.test(name) || /^pom\.xml$/i.test(name)) return 6;
  if (path.includes('/test/') || path.includes('/tests/') || path.includes('/__tests__/') || path.includes('/spec/')) return 2;

  return 1;
}

const SMART_SUMMARIZE_SYSTEM_PROMPT = `You are a code intelligence assistant built into Codex, a developer tool for understanding and analyzing GitHub repositories.

Your job right now is to read a small set of files from a GitHub repository and produce a clear, accurate, one-page project brief. These files were specifically chosen because they contain the most useful information about what the project does — things like the README, the main entry point, the data models, and the routing layer. You have NOT been given every file in the repository, only the most informative ones.

Your brief will be shown to developers who want to understand a project quickly without reading the code themselves. Write for a developer audience. Be direct and specific. Do not use phrases like "this project aims to" or "the goal of this application is". Just say what it does.

VERY IMPORTANT RULES — READ THESE CAREFULLY:

1. Only describe what you can actually see in the provided files. Do not guess at features that might exist but are not shown. Do not assume the project has authentication just because most projects do. Only mention it if you see it in the files.

2. Only list technologies you can see evidence of. If you see React in the package.json, list React. If you do not see a database mentioned anywhere, do not list one.

3. Keep every section short. Developers do not want to read paragraphs. They want the facts.

4. If the README is missing or very short and the code files do not give enough context, set the confidence field to "low" and explain briefly what was missing.

5. Return ONLY the JSON object described below. Do not write anything before the JSON. Do not write anything after the JSON. Do not wrap it in markdown code fences. Just the raw JSON. No formatting, no backticks.

HERE IS THE EXACT JSON STRUCTURE YOU MUST RETURN:

{
  "one_liner": "Write one sentence, maximum 20 words, describing what this project does and who it is for.",
  "what_it_does": "Write two or three sentences about the core problem this project solves and how it solves it technically. Do not start with 'This project'. Start with the action.",
  "stack": {
    "frontend": ["List every frontend technology you can confirm from the files. If none, write ['none detected']."],
    "backend": ["List every backend technology you can confirm."],
    "database": ["List every database or storage technology."],
    "ai_ml": ["List any AI or machine learning components. If none, write ['none detected']."],
    "infrastructure": ["List any deployment, hosting, or infrastructure tools. If none, write ['none detected']."]
  },
  "how_it_works": [
    "Step 1: Describe the first main thing that happens when a user interacts with this system. Keep it under 25 words.",
    "Step 2: Describe the second main thing. Under 25 words.",
    "Step 3: Describe the third main thing. Under 25 words."
  ],
  "data_model": "Write one paragraph, maximum four sentences, describing what data this system stores, what the main data entities are, and how they relate to each other. Base this only on schemas, model files, or type definitions you can see in the provided files.",
  "architecture_style": "Write one sentence describing the overall architecture pattern.",
  "gaps_and_observations": [
    "Write one observation about something that seems incomplete, missing, poorly documented, or worth noting.",
    "Write a second observation if there is one."
  ],
  "confidence": "Write exactly one of these three words: high, medium, or low."
}`;

// POST /api/repos/brief
// Body: { owner, repo }
export async function getRepoBrief(req: Request, res: Response): Promise<void> {
  const { owner, repo } = req.body as { owner: string; repo: string };

  if (!owner || !repo) {
    res.status(400).json({ error: 'owner and repo are required' });
    return;
  }

  let githubToken = '';
  if (req.user?.id) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT github_token FROM users WHERE id = ?', [req.user.id]
    );
    githubToken = rows[0]?.github_token || '';
  }

  try {
    const startTime = Date.now();
    const structure = await getRepoStructure(githubToken, owner, repo);

    const scoredFiles = structure.sampled_files
      .map(f => ({ ...f, score: scoreFile(f.path) }))
      .filter(f => f.score > 0)
      .sort((a, b) => b.score - a.score);

    const selectedFiles = scoredFiles.slice(0, 12);

    const filesBlock = selectedFiles.map(f =>
      `--- ${f.path} ---\n${f.content}`
    ).join('\n\n');

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SMART_SUMMARIZE_SYSTEM_PROMPT },
        { role: 'user', content: `HERE ARE THE FILES:\n\n${filesBlock}` },
      ],
      temperature: 0.1,
    });

    const rawText = response.choices[0]?.message?.content || '';

    let parsed: Record<string, unknown>;
    try {
      parsed = parseModelJson<Record<string, unknown>>(rawText);
    } catch {
      res.status(500).json({ error: 'Failed to parse AI response', raw: rawText.slice(0, 500) });
      return;
    }

    const totalTokens = response.usage?.total_tokens || 0;
    const elapsed = (Date.now() - startTime) / 1000;

    res.json({
      ...parsed,
      files_read: selectedFiles.length,
      tokens_used: totalTokens,
      generated_in_s: Math.round(elapsed * 10) / 10,
    });
  } catch (err) {
    console.error('Brief generation error:', err);
    res.status(500).json({ error: 'Failed to generate brief: ' + (err instanceof Error ? err.message : '') });
  }
}
