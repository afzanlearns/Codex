import Groq from 'groq-sdk';
import { AIReviewResult } from '../types/index';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const REVIEW_SYSTEM_PROMPT = `You are Codex, a world-class senior code reviewer with 
expertise in security, performance, and software architecture. You produce deeply 
analytical, actionable code reviews.

Your response MUST be valid JSON matching this EXACT structure — no markdown, no 
preamble, just the JSON object:

{
  "scores": {
    "overall": <0-10 decimal, weighted average>,
    "correctness": <0-10, are there bugs or logic errors?>,
    "readability": <0-10, is it clean and understandable?>,
    "security": <0-10, are there vulnerabilities?>,
    "performance": <0-10, any bottlenecks or inefficiencies?>,
    "maintainability": <0-10, is it easy to modify and extend?>
  },
  "summary": "<2-3 sentence overall verdict — be direct and specific>",
  "grade": "<one of: A, B, C, D, F>",
  "risk_level": "<one of: low, medium, high, critical>",
  "strengths": [
    "<specific thing done well>",
    "<another strength>"
  ],
  "critical_issues": [
    {
      "title": "<short title>",
      "explanation": "<what is wrong and why it matters>",
      "fix": "<exact code or specific fix>",
      "impact": "<what happens if not fixed>"
    }
  ],
  "improvements": [
    {
      "title": "<improvement title>",
      "explanation": "<why this would be better>",
      "before": "<current code pattern>",
      "after": "<improved code pattern>"
    }
  ],
  "comments": [
    {
      "filename": null,
      "line_start": <line number or null>,
      "line_end": <line number or null>,
      "content": "<specific finding — reference actual variable names and patterns>",
      "suggestion": "<concrete actionable fix>",
      "severity": "<info|low|medium|high|critical>",
      "categories": ["<one or more of: bug, security, performance, readability, smell, docs, style, test, complexity, type_safety>"]
    }
  ],
  "metrics": {
    "estimated_complexity": "<low|medium|high>",
    "test_coverage_hint": "<none|partial|adequate>",
    "code_smell_count": <integer>,
    "security_issue_count": <integer>,
    "lines_analyzed": <integer>
  }
}

SCORING RULES:
- overall = (correctness * 0.30) + (security * 0.25) + (readability * 0.20) + (performance * 0.15) + (maintainability * 0.10)
- grade: A = 8.5+, B = 7-8.4, C = 5-6.9, D = 3-4.9, F = below 3
- risk_level: critical if security < 5 or correctness < 4, high if overall < 5, medium if overall < 7, low otherwise
- strengths: always include at least 1, max 4
- critical_issues: only include severity high or critical issues here
- improvements: 2-4 actionable non-critical improvements
- comments: every individual finding as a line-level comment
- Be brutally specific — reference exact variable names, line patterns, function names
- Never give generic advice like "add error handling" — always show the exact fix`;

export interface EnhancedAIReviewResult extends AIReviewResult {
  grade: string;
  risk_level: string;
  strengths: string[];
  critical_issues: Array<{
    title: string;
    explanation: string;
    fix: string;
    impact: string;
  }>;
  improvements: Array<{
    title: string;
    explanation: string;
    before: string;
    after: string;
  }>;
  metrics: {
    estimated_complexity: string;
    test_coverage_hint: string;
    code_smell_count: number;
    security_issue_count: number;
    lines_analyzed: number;
  };
}

export async function reviewCode(
  code: string,
  language: string,
  customRules: string[] = []
): Promise<EnhancedAIReviewResult> {
  const rulesSection = customRules.length > 0
    ? `\n\nCUSTOM RULES (enforce these strictly):\n${customRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const userMessage = `Language: ${language}${rulesSection}\n\nCode to review:\n\`\`\`${language}\n${code}\n\`\`\``;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 3000,
    messages: [
      { role: 'system', content: REVIEW_SYSTEM_PROMPT },
      { role: 'user',   content: userMessage },
    ],
  });

  const rawText = response.choices[0]?.message?.content || '';
  const jsonText = rawText.replace(/```json\n?|\n?```/g, '').trim();

  try {
    return JSON.parse(jsonText) as EnhancedAIReviewResult;
  } catch {
    // Attempt to extract JSON from response if there's extra text
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as EnhancedAIReviewResult;
    throw new Error('Failed to parse AI response as JSON');
  }
}

export async function generateWeeklyDigest(teamReport: Record<string, unknown>): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Generate a concise, professional weekly code quality digest for an 
engineering team based on this data: ${JSON.stringify(teamReport, null, 2)}

Write 3-4 short paragraphs covering: overall team performance, notable improvements 
or declines, recurring issues to address, one actionable recommendation.
Tone: direct, data-driven, constructive. No bullet points.`
    }]
  });
  return response.choices[0]?.message?.content || '';
}

export interface CodebaseAnalysis {
  scores: {
    overall: number;
    structure: number;
    code_quality: number;
    security: number;
    performance: number;
    maintainability: number;
    documentation: number;
    test_coverage: number;
    dependency_health: number;
  };
  grade: string;
  plain_english_summary: string;
  target_audience: string;
  how_to_run: string[];
  key_folders: Array<{ path: string; description: string }>;
  architecture_layers: Array<{
    layer_name: string;
    components: Array<{
      name: string;
      description: string;
      technologies: string[];
    }>;
  }>;
  summary: string;
  architecture_notes: string;
  tech_stack: string[];
  languages_used: Array<{ name: string; percentage: number; bytes: number }>;
  strengths: string[];
  critical_issues: Array<{
    title: string;
    explanation: string;
    affected_files: string[];
    priority: 'low' | 'medium' | 'high';
  }>;
  recommendations: Array<{
    type: 'issue' | 'automation' | 'refactor';
    title: string;
    description: string;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    estimated_minutes: number;
    tags: string[];
  }>;
  unnecessary_code: Array<{
    description: string;
    files: string[];
  }>;
  security_findings: Array<{
    title: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affected_files: string[];
  }>;
  file_insights: Array<{
    path: string;
    role: string;
    quality_note: string;
    issues: string[];
  }>;
}

export async function analyzeCodebase(
  structure: import('./githubService').RepoStructure
): Promise<CodebaseAnalysis> {

  const langBreakdown = Object.entries(structure.languages)
    .sort(([,a],[,b]) => b - a)
    .map(([lang, bytes]) => `${lang}: ${Math.round(bytes/1024)}KB`)
    .join(', ');

  const totalLangBytes = Object.values(structure.languages).reduce((a, b) => a + b, 0);
  const languagesUsed = Object.entries(structure.languages)
    .sort(([,a],[,b]) => b - a)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percentage: Math.round((bytes / totalLangBytes) * 100),
    }));

  const sampledFilesContent = structure.sampled_files
    .map(f => `\n${'='.repeat(60)}\nFILE: ${f.path} (${f.size} bytes)\n${'='.repeat(60)}\n${f.content}`)
    .join('\n');

  const fileTypeInfo = Object.entries(structure.file_type_breakdown)
    .slice(0, 10)
    .map(([ext, count]) => `${ext}: ${count} files`)
    .join(', ');

  const prompt = `You are a senior software architect performing a deep codebase analysis.
Analyze this GitHub repository thoroughly based on ALL provided files.
Return ONLY a valid JSON object — no markdown, no preamble, no trailing text.

REPOSITORY METADATA:
- Name: ${structure.full_name}
- Description: ${structure.description || 'none provided'}
- Primary Language: ${structure.language || 'unknown'}
- Total Files: ${structure.file_count}
- File Types: ${fileTypeInfo}
- Languages: ${langBreakdown}

DIRECTORY STRUCTURE:
${structure.directory_structure}

SAMPLED FILE CONTENTS (${structure.sampled_files.length} files analyzed):
${sampledFilesContent}

Return this EXACT JSON structure — no markdown, no extra text, only JSON:
{
  "scores": {
    "overall": <0-100 integer, weighted health score>,
    "structure": <0-100>,
    "code_quality": <0-100>,
    "security": <0-100>,
    "performance": <0-100>,
    "maintainability": <0-100>,
    "documentation": <0-100>,
    "test_coverage": <0-100>,
    "dependency_health": <0-100>
  },
  "grade": "<A if overall>=85, B if >=70, C if >=50, D if >=30, F below 30>",
  "plain_english_summary": "<3-4 sentences explaining what this repo actually does in plain English, as if explaining to a non-developer>",
  "target_audience": "<who would use this — developers, consumers, businesses, etc. 1-2 sentences>",
  "how_to_run": [
    "<exact shell command 1, e.g. git clone https://github.com/owner/repo>",
    "<exact shell command 2, e.g. cd repo-name>",
    "<exact shell command 3, e.g. npm install>",
    "<exact shell command 4, e.g. npm run dev>"
  ],
  "key_folders": [
    {
      "path": "<folder path, e.g. src/components/>",
      "description": "<1-2 sentence plain English explanation of what lives here>"
    }
  ],
  "architecture_layers": [
    {
      "layer_name": "<e.g. Frontend, Backend, Database, Services, Infrastructure>",
      "components": [
        {
          "name": "<component name>",
          "description": "<what it does>",
          "technologies": ["<tech 1>", "<tech 2>"]
        }
      ]
    }
  ],
  "summary": "<3-4 technical sentences assessing overall codebase quality>",
  "architecture_notes": "<2-3 sentences on architectural pattern>",
  "tech_stack": ["<technology 1>", "<technology 2>"],
  "languages_used": [
    { "name": "<language>", "percentage": <0-100 integer>, "bytes": <integer> }
  ],
  "strengths": ["<specific strength>"],
  "critical_issues": [
    {
      "title": "<issue title>",
      "explanation": "<what is wrong and why>",
      "affected_files": ["<file path>"],
      "priority": "<low|medium|high>"
    }
  ],
  "recommendations": [
    {
      "type": "<issue|automation|refactor>",
      "title": "<recommendation title>",
      "description": "<specific actionable recommendation>",
      "effort": "<low|medium|high>",
      "impact": "<low|medium|high>",
      "estimated_minutes": <integer, realistic time estimate>,
      "tags": ["<tag1>", "<tag2>"]
    }
  ],
  "unnecessary_code": [
    {
      "description": "<what unnecessary code exists>",
      "files": ["<file path>"]
    }
  ],
  "security_findings": [
    {
      "title": "<finding title>",
      "severity": "<info|low|medium|high|critical>",
      "description": "<what the issue is>",
      "affected_files": ["<file path>"]
    }
  ],
  "file_insights": [
    {
      "path": "<file path>",
      "role": "<what this file does>",
      "quality_note": "<one sentence assessment>",
      "issues": ["<specific issue>"]
    }
  ]
}

SCORING RULES (0-100 scale):
overall = weighted: code_quality*0.20 + security*0.20 + performance*0.15 + structure*0.15 + maintainability*0.15 + documentation*0.05 + test_coverage*0.05 + dependency_health*0.05
how_to_run: extract ACTUAL commands from README or package.json scripts — do not invent them
key_folders: only include directories that actually exist in the file tree
architecture_layers: group by actual architectural concerns you see in the code
recommendations.type: "issue" = bug/problem to fix, "automation" = workflow/CI to add, "refactor" = code improvement
estimated_minutes: be realistic — a simple README fix is 15 min, adding CI/CD is 30 min, major refactor is 120+ min
file_insights: provide insights for AT LEAST 5 key files
Return empty arrays [] if nothing found — never omit a field`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt.slice(0, 25000) }],
    temperature: 0.1,
  });

  const raw   = response.choices[0]?.message?.content || '';
  const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);

  try {
    const parsed = JSON.parse(match ? match[0] : clean) as CodebaseAnalysis;
    // Inject accurate language data from GitHub API (more reliable than AI guess)
    if (structure.languages && Object.keys(structure.languages).length > 0) {
      const total = Object.values(structure.languages).reduce((a, b) => a + b, 0);
      parsed.languages_used = Object.entries(structure.languages)
        .sort(([,a],[,b]) => b - a)
        .map(([name, bytes]) => ({
          name,
          bytes,
          percentage: Math.round((bytes / total) * 100),
        }));
    }
    return parsed;
  } catch (e) {
    throw new Error('Failed to parse codebase analysis: ' + (e instanceof Error ? e.message : ''));
  }
}
