import { Request, Response } from 'express';
import { ingestionService } from '../services/ingestionService';
import { owaspService } from '../services/owaspService';
import pool from '../db/connection';
import { RowDataPacket } from 'mysql2';

// POST /api/rag/index
// Kicks off (or re-runs) indexing for a connected GitHub repo.
export async function startIndex(req: Request, res: Response): Promise<void> {
  const { repoId } = req.body as { repoId: number };
  const userId = req.user!.id;

  if (!repoId) {
    res.status(400).json({ error: 'repoId is required' });
    return;
  }

  // Verify repo belongs to this user
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, github_token FROM repositories r JOIN users u ON u.id = ? WHERE r.id = ? AND r.user_id = ?',
    [userId, repoId, userId]
  );

  // Try fetching the token from the user record instead
  const [userRows] = await pool.execute<RowDataPacket[]>(
    'SELECT github_token FROM users WHERE id = ?',
    [userId]
  );

  if (!userRows.length || !userRows[0].github_token) {
    res.status(403).json({ error: 'GitHub account not connected. Please link GitHub in settings.' });
    return;
  }

  const githubToken = userRows[0].github_token;

  const jobId = await ingestionService.startIndexing(repoId, userId, githubToken);
  res.status(202).json({ jobId, message: 'Indexing started' });
}

// GET /api/rag/jobs/:jobId
// Poll the in-memory job status for a running indexing task.
export async function getJobStatus(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const job = ingestionService.getJobStatus(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
}

// GET /api/rag/repos/:repoId/status
// Returns the persisted index status for a repo from the DB.
export async function getRepoIndexStatus(req: Request, res: Response): Promise<void> {
  const { repoId } = req.params;
  const userId = req.user!.id;

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ir.*, r.name, r.owner, r.full_name
     FROM indexed_repos ir
     JOIN repositories r ON r.id = ir.repo_id
     WHERE ir.repo_id = ? AND ir.user_id = ?`,
    [repoId, userId]
  );

  if (!rows.length) {
    res.json({ status: 'not_indexed', repoId: Number(repoId) });
    return;
  }

  res.json(rows[0]);
}

// GET /api/rag/repos
// Returns index status for ALL repos belonging to this user.
export async function getAllRepoIndexStatuses(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ir.*, r.name, r.owner, r.full_name
     FROM indexed_repos ir
     JOIN repositories r ON r.id = ir.repo_id
     WHERE ir.user_id = ?
     ORDER BY ir.last_indexed_at DESC`,
    [userId]
  );

  res.json(rows);
}

// DELETE /api/rag/repos/:repoId
// Removes the Chroma collection and DB record for a repo's index.
export async function deleteRepoIndex(req: Request, res: Response): Promise<void> {
  const { repoId } = req.params;
  const userId = req.user!.id;

  // Verify ownership
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM indexed_repos WHERE repo_id = ? AND user_id = ?',
    [repoId, userId]
  );
  if (!rows.length) {
    res.status(404).json({ error: 'Index not found' });
    return;
  }

  try {
    const chroma = (await import('../db/chroma')).default;
    await chroma.deleteCollection(`codebase_${repoId}`);
  } catch (_) {
    // Collection may not exist — that's fine
  }

  await pool.execute(
    'DELETE FROM indexed_repos WHERE repo_id = ? AND user_id = ?',
    [repoId, userId]
  );

  res.json({ success: true, message: 'Index deleted' });
}

// POST /api/rag/owasp/seed
// Admin: seed or re-seed the OWASP corpus into ChromaDB.
export async function seedOwasp(req: Request, res: Response): Promise<void> {
  try {
    await owaspService.seedOwaspCorpus();
    res.json({ success: true, message: 'OWASP corpus seeded successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

// GET /api/rag/owasp/status
// Check if OWASP corpus exists and how many entries it has.
export async function getOwaspStatus(req: Request, res: Response): Promise<void> {
  try {
    const chroma = (await import('../db/chroma')).default;
    const collection = await chroma.getOrCreateCollection('owasp_top10');
    const count = await collection.count();
    res.json({ status: count > 0 ? 'ready' : 'empty', count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
