import { Request, Response } from 'express';
import Groq from 'groq-sdk';
import { retrievalService } from '../services/retrievalService';
import { parseModelJson } from '../utils/jsonParse';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const REFACTOR_SYSTEM_PROMPT = `You are Codex Refactor — an expert software architect 
specializing in evidence-based code refactoring.

You receive:
1. A code snippet to refactor
2. Retrieved context showing related patterns from the same codebase and past review findings

Your task: produce a structured JSON refactoring plan that is GROUNDED in the retrieved evidence.

Respond ONLY with valid JSON — no markdown, no preamble, no code fences, no backticks:

{
  "summary": "<2-3 sentence summary of what will be improved and why>",
  "confidence": <0.0-1.0 float, how confident you are based on the evidence>,
  "estimated_effort": "<low|medium|high>",
  "refactoring_opportunities": [
    {
      "id": "<e.g. REF_1>",
      "title": "<short descriptive title>",
      "type": "<one of: extract_function, extract_class, simplify_logic, improve_naming, remove_duplication, add_abstraction, improve_error_handling, optimize_performance, improve_typing, split_responsibility>",
      "priority": "<high|medium|low>",
      "rationale": "<why this refactoring is recommended — cite the source evidence>",
      "citation_id": "<SOURCE_N that most supports this recommendation, or null>",
      "before": "<the exact code snippet that should be refactored>",
      "after": "<the refactored version>",
      "impact": {
        "readability": "<improved|unchanged|degraded>",
        "performance": "<improved|unchanged|degraded>",
        "maintainability": "<improved|unchanged|degraded>",
        "testability": "<improved|unchanged|degraded>"
      },
      "caveats": "<edge cases or risks to watch for>"
    }
  ],
  "consistency_notes": [
    "<observation about how this code differs from patterns found in the rest of the codebase>"
  ],
  "similar_patterns_found": [
    {
      "description": "<what similar pattern was found>",
      "file_reference": "<file:line range or null>",
      "citation_id": "<SOURCE_N>"
    }
  ]
}

RULES:
- Only recommend refactors that are supported by the retrieved context.
- If no relevant context is found, provide general best-practice refactors and set confidence <= 0.4.
- before/after must be actual code snippets, not descriptions.
- consistency_notes: compare to the patterns found in the same codebase.
- similar_patterns_found: call out when the retrieved context shows better patterns already used elsewhere in the codebase.`;

// POST /api/refactor
// Body: { code: string, language: string, repoId?: number }
export async function getRefactorSuggestions(req: Request, res: Response): Promise<void> {
  const { code, language, repoId } = req.body as {
    code: string;
    language: string;
    repoId?: number;
  };

  const userId = req.user!.id;

  if (!code || code.trim().length < 10) {
    res.status(400).json({ error: 'Code must be at least 10 characters' });
    return;
  }

  if (!language) {
    res.status(400).json({ error: 'Language is required' });
    return;
  }

  // Retrieve related code patterns from indexed codebase + review memory
  const ragStart = Date.now();
  let contextBlock = '';
  let citationMap: Record<string, {
    corpusName: string;
    filePath: string;
    startLine: number;
    endLine: number;
    displayLabel: string;
  }> = {};

  try {
    const chunks = await retrievalService.retrieveForRefactor(code, language, repoId, userId, 6);
    chunks.forEach((chunk, idx) => {
      const sourceId = `SOURCE_${idx + 1}`;
      contextBlock += `[${sourceId}] ${chunk.displayLabel} (${chunk.filePath}:L${chunk.startLine}-${chunk.endLine}):\n\`\`\`${chunk.language || language}\n${chunk.text.slice(0, 600)}\n\`\`\`\n\n`;
      citationMap[sourceId] = {
        corpusName: chunk.corpusName,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        displayLabel: chunk.displayLabel,
      };
    });
  } catch (err) {
    console.warn('RAG retrieval for refactor failed:', (err as Error).message);
  }

  const ragLatencyMs = Date.now() - ragStart;

  const systemPrompt = contextBlock
    ? `${REFACTOR_SYSTEM_PROMPT}\n\n--- RETRIEVED CODEBASE CONTEXT ---\n${contextBlock}--- END CONTEXT ---`
    : REFACTOR_SYSTEM_PROMPT;

  const userMessage = `Language: ${language}\n\nCode to refactor:\n\`\`\`${language}\n${code}\n\`\`\``;

  const llmStart = Date.now();
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 3000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
    temperature: 0.2,
  });

  const rawText = response.choices[0]?.message?.content || '';

  let parsed: Record<string, unknown>;
  try {
    parsed = parseModelJson<Record<string, unknown>>(rawText);
  } catch {
    res.status(500).json({ error: 'Failed to parse refactoring response from AI', raw: rawText.slice(0, 500) });
    return;
  }

  res.json({
    ...parsed,
    rag_context: {
      chunksRetrieved: Object.keys(citationMap).length,
      ragLatencyMs,
      llmLatencyMs: Date.now() - llmStart,
    },
    citation_map: citationMap,
  });
}
