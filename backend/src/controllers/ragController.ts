import { Request, Response } from 'express';
import { ingestionService } from '../services/ingestionService';
import { owaspService } from '../services/owaspService';
import { getRepoStructure, getRepoTree } from '../services/githubService';
import pool from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

// POST /api/rag/index
// Kicks off (or re-runs) indexing for a connected GitHub repo.
export async function startIndex(req: Request, res: Response): Promise<void> {
  const { repoId, selectedPaths, owner, repoName } = req.body as {
    repoId?: number;
    selectedPaths?: string[];
    owner?: string;
    repoName?: string;
  };
  const userId = req.user!.id;

  if (!repoId && !(owner && repoName)) {
    res.status(400).json({ error: 'repoId, or owner and repoName, is required' });
    return;
  }

  const [userRows] = await pool.execute<RowDataPacket[]>(
    'SELECT github_token FROM users WHERE id = ?',
    [userId]
  );

  if (!userRows.length || !userRows[0].github_token) {
    res.status(403).json({ error: 'GitHub account not connected. Please link GitHub in settings.' });
    return;
  }

  const githubToken = userRows[0].github_token;

  try {
    // Try to find repo by DB id first
    let dbRepoRow: RowDataPacket | null = null;
    if (repoId) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM repositories WHERE id = ? AND user_id = ?',
        [repoId, userId]
      );
      if (rows.length) dbRepoRow = rows[0];
    }

    // Fallback: find by owner + name
    let dbRepoId: number;
    if (dbRepoRow) {
      dbRepoId = dbRepoRow.id as number;
    } else if (owner && repoName) {
      // Try to find existing record
      const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM repositories WHERE owner = ? AND name = ? AND user_id = ?',
        [owner, repoName, userId]
      );
      if (existing.length) {
        dbRepoId = existing[0].id as number;
      } else {
        // Create the repo record
        const [result] = await pool.execute<ResultSetHeader>(
          `INSERT INTO repositories (user_id, owner, name, full_name)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE owner = VALUES(owner)`,
          [userId, owner, repoName, `${owner}/${repoName}`]
        );
        dbRepoId = result.insertId;
      }
    } else {
      res.status(400).json({ error: 'Could not resolve repository. Pass owner and repoName.' });
      return;
    }

    const jobId = await ingestionService.startIndexing(dbRepoId, userId, githubToken, selectedPaths);
    res.status(202).json({ jobId, repoId: dbRepoId, message: 'Indexing started' });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
}

// GET /api/rag/jobs/:jobId
// Poll the in-memory job status for a running indexing task.
export async function getJobStatus(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const job = ingestionService.getJobStatus(jobId as string);
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

// GET /api/rag/filetree/:repoId
// Returns the repository's file tree for the pre-indexing file picker.
export async function getFileTree(req: Request, res: Response): Promise<void> {
  const { owner, repo } = req.query as { owner?: string; repo?: string };

  if (!owner || !repo) {
    res.status(400).json({ error: 'owner and repo query params are required' });
    return;
  }

  try {
    const userId = req.user!.id;
    const [userRows] = await pool.execute<RowDataPacket[]>(
      'SELECT github_token FROM users WHERE id = ?',
      [userId]
    );
    const githubToken = userRows[0]?.github_token;

    const tree = await getRepoTree(owner, repo, githubToken);

    const totalFiles = tree.filter(n => n.type === 'blob').length;
    const totalFolders = tree.filter(n => n.type === 'tree').length;

    res.json({ tree, totalFiles, totalFolders });
  } catch (err) {
    console.error('getFileTree error:', err);
    res.status(500).json({ error: 'Failed to fetch file tree' });
  }
}

// POST /api/rag/owasp/seed
// Admin: seed or re-seed the OWASP corpus into ChromaDB.
export async function seedOwasp(req: Request, res: Response): Promise<void> {
  try {
    await owaspService.loadCorpus(true);
    const entries = owaspService.getCount();
    res.json({ success: true, entries });
  } catch (err) {
    console.error('OWASP seed error:', err);
    res.status(500).json({ error: 'Failed to seed OWASP corpus' });
  }
}

// GET /api/rag/owasp/status
// Check if OWASP corpus exists and how many entries it has.
export async function getOwaspStatus(req: Request, res: Response): Promise<void> {
  try {
    const chroma = (await import('../db/chroma')).default;
    const collection = await chroma.getOrCreateCollection('owasp_security');
    const count = await collection.count();
    res.json({ status: count > 0 ? 'ready' : 'empty', count });
  } catch (err) {
    console.error('OWASP status check failed:', err);
    res.json({ status: 'unavailable', count: 0, error: (err as Error).message });
  }
}
