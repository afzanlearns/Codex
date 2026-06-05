import { Request, Response } from 'express';
import Groq from 'groq-sdk';
import { retrievalService } from '../services/retrievalService';
import pool from '../db/connection';
import { RowDataPacket } from 'mysql2';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const CHAT_SYSTEM_PROMPT = `You are Codex Chat — an expert AI assistant embedded inside a developer intelligence platform.
You answer questions about a user's codebase using retrieved code snippets provided to you.

Rules:
- Answer ONLY based on the provided code context.
- If you cannot answer from the context, say exactly: "I don't have enough indexed context to answer this question."
- Always reference the specific file and line range (e.g., \`src/services/authService.ts:L12-L45\`) when citing code.
- Use markdown code blocks with language identifiers for code.
- Be concise but technically precise.
- Never hallucinate functions, variables, or files that aren't in the context.`;

// POST /api/chat
// Body: { query: string, repoId?: number, conversationHistory?: [{role, content}] }
// Returns streaming SSE
export async function chatWithCodebase(req: Request, res: Response): Promise<void> {
  const { query, repoId, conversationHistory = [] } = req.body as {
    query: string;
    repoId?: number;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  const userId = req.user!.id;

  if (!query || query.trim().length < 3) {
    res.status(400).json({ error: 'Query must be at least 3 characters' });
    return;
  }

  // Verify repoId belongs to this user if provided
  if (repoId) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM indexed_repos WHERE repo_id = ? AND user_id = ? AND status = ?',
      [repoId, userId, 'ready']
    );
    if (!rows.length) {
      res.status(404).json({ error: 'Repository not indexed or not found. Please index it first.' });
      return;
    }
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 1. Retrieve relevant code chunks
    sendEvent('status', { message: 'Searching codebase...', phase: 'retrieval' });

    const chunks = await retrievalService.retrieveForChat(query, repoId, userId, 8);

    if (chunks.length === 0 && repoId) {
      sendEvent('error', { message: 'No relevant code found. Try indexing your repository first.' });
      res.end();
      return;
    }

    // 2. Build context block
    const contextBlock = chunks
      .map((chunk, idx) =>
        `[SOURCE_${idx + 1}] File: ${chunk.filePath} (Lines ${chunk.startLine}–${chunk.endLine})\n\`\`\`${chunk.language}\n${chunk.text.slice(0, 1000)}\n\`\`\``
      )
      .join('\n\n');

    const citationMap = chunks.map((chunk, idx) => ({
      sourceId: `SOURCE_${idx + 1}`,
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      displayLabel: chunk.displayLabel,
      corpusName: chunk.corpusName,
    }));

    sendEvent('sources', { sources: citationMap });

    // 3. Build messages
    const systemMsg = chunks.length > 0
      ? `${CHAT_SYSTEM_PROMPT}\n\n--- RETRIEVED CODE CONTEXT ---\n${contextBlock}\n--- END CONTEXT ---`
      : `${CHAT_SYSTEM_PROMPT}\n\nNote: No specific repository is indexed. Answer general programming questions only.`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemMsg },
      ...conversationHistory.slice(-8).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: query },
    ];

    sendEvent('status', { message: 'Generating response...', phase: 'generation' });

    // 4. Stream Groq completion
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1500,
      stream: true,
      messages,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullResponse += delta;
        sendEvent('token', { token: delta });
      }
    }

    sendEvent('done', {
      fullResponse,
      sourcesUsed: citationMap.length,
    });

  } catch (err) {
    console.error('Chat error:', err);
    sendEvent('error', { message: (err as Error).message || 'Chat request failed' });
  } finally {
    res.end();
  }
}

// GET /api/chat/repos
// Returns the list of this user's indexed repos available for chat.
export async function getChatableRepos(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ir.repo_id, ir.status, ir.chunk_count, ir.last_indexed_at,
            r.name, r.owner, r.full_name, r.language
     FROM indexed_repos ir
     JOIN repositories r ON r.id = ir.repo_id
     WHERE ir.user_id = ? AND ir.status = 'ready'
     ORDER BY ir.last_indexed_at DESC`,
    [userId]
  );

  res.json(rows);
}
