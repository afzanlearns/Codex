import Groq from 'groq-sdk';
import { AIReviewResult } from '../types/index';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const REVIEW_SYSTEM_PROMPT = `You are Codex, an expert code review AI. Analyze the provided code and return a structured JSON review.

Your response MUST be valid JSON matching this exact structure:
{
  "scores": {
    "overall": <0-10 decimal>,
    "correctness": <0-10>,
    "readability": <0-10>,
    "security": <0-10>,
    "performance": <0-10>,
    "maintainability": <0-10>
  },
  "summary": "<2-3 sentence overall assessment>",
  "comments": [
    {
      "filename": "<filename or null>",
      "line_start": <line number or null>,
      "line_end": <line number or null>,
      "content": "<specific finding, be precise and actionable>",
      "suggestion": "<concrete fix or improvement>",
      "severity": "<info|low|medium|high|critical>",
      "categories": ["<one or more of: bug, security, performance, readability, smell, docs, style, test, complexity, type_safety>"]
    }
  ]
}

Rules:
- overall score = weighted average (correctness 30%, security 25%, readability 20%, performance 15%, maintainability 10%)
- Be specific: reference actual variable names, line patterns, and code constructs
- Provide actionable suggestions, not vague advice
- Flag security vulnerabilities as critical regardless of other scores
- Return ONLY the JSON object, no markdown, no preamble`;

export async function reviewCode(
  code: string,
  language: string,
  customRules: string[] = []
): Promise<AIReviewResult> {
  const rulesSection = customRules.length > 0
    ? `\n\nCUSTOM RULES (enforce these strictly):\n${customRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const userMessage = `Language: ${language}${rulesSection}\n\nCode to review:\n\`\`\`${language}\n${code}\n\`\`\``;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 2000,
    messages: [
      { role: 'system', content: REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ]
  });

  const rawText = response.choices[0]?.message?.content || '';

  // Strip any markdown fences if present
  const jsonText = rawText.replace(/```json\n?|\n?```/g, '').trim();
  const parsed = JSON.parse(jsonText) as AIReviewResult;

  return parsed;
}

export async function generateWeeklyDigest(teamReport: Record<string, unknown>): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Generate a concise, professional weekly code quality digest for an engineering team based on this data:
${JSON.stringify(teamReport, null, 2)}

Write 3-4 short paragraphs covering:
1. Overall team performance this week
2. Notable improvements or declines  
3. Recurring issues to address
4. One actionable recommendation

Tone: direct, data-driven, constructive. No bullet points.`
    }]
  });

  return response.choices[0]?.message?.content || '';
}
