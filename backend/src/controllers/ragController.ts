import { Request, Response } from 'express';
import { ingestionService } from '../services/ingestionService';
import { owaspService } from '../services/owaspService';
import { getRepoStructure, getRepoTree } from '../services/githubService';
import pool from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { Octokit } from 'octokit';
import chroma from '../db/chroma';
import embeddingService from '../services/embeddingService';
import crypto from 'crypto';

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

// POST /api/rag/index-public
// Index ANY public GitHub repository without requiring authentication
export async function indexPublicRepo(req: Request, res: Response): Promise<void> {
  const { owner, repoName, url } = req.body as { owner?: string; repoName?: string; url?: string };

  let resolvedOwner = owner || '';
  let resolvedRepo = repoName || '';

  if (url) {
    const clean = url.trim().replace(/\.git$/, '');
    const match = clean.match(/(?:github\.com\/)?([^/\s]+)\/([^/\s]+)/);
    if (!match) {
      res.status(400).json({ error: 'Invalid GitHub URL' });
      return;
    }
    resolvedOwner = match[1];
    resolvedRepo = match[2];
  }

  if (!resolvedOwner || !resolvedRepo) {
    res.status(400).json({ error: 'owner and repoName (or url) are required' });
    return;
  }

  try {
    const octokit = new Octokit();
    const { data: repoData } = await octokit.rest.repos.get({ owner: resolvedOwner, repo: resolvedRepo });
    if (repoData.private) {
      res.status(403).json({ error: 'This repository is private. Cannot index private repos without authentication.' });
      return;
    }

    const collectionName = `codebase_public_${resolvedOwner}_${resolvedRepo}`;

    // Check if already indexed
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id, status, chunks_count, files_count FROM indexed_public_repos WHERE owner = ? AND repo_name = ?',
      [resolvedOwner, resolvedRepo]
    );

    if (existing.length > 0 && existing[0].status === 'ready') {
      res.json({
        status: 'already_indexed',
        repoId: existing[0].id,
        owner: resolvedOwner,
        repoName: resolvedRepo,
        files_processed: existing[0].files_count,
        chunks_created: existing[0].chunks_count,
        collection_name: collectionName,
      });
      return;
    }

    // Insert or update pending status
    let dbId: number;
    if (existing.length > 0) {
      dbId = existing[0].id;
      await pool.execute(
        'UPDATE indexed_public_repos SET status = ?, indexed_at = NOW() WHERE id = ?',
        ['indexing', dbId]
      );
    } else {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO indexed_public_repos (owner, repo_name, github_url, chroma_collection_name, status, indexed_at)
         VALUES (?, ?, ?, ?, 'indexing', NOW())`,
        [resolvedOwner, resolvedRepo, repoData.html_url, collectionName]
      );
      dbId = result.insertId;
    }

    // Fetch structure and source files
    const structure = await getRepoStructure('', resolvedOwner, resolvedRepo);
    const allFiles = structure.sampled_files || [];

    // Chunk files
    const chunks: Array<{
      chunkId: string;
      text: string;
      filePath: string;
      startLine: number;
      endLine: number;
      language: string;
      chunkType: string;
    }> = [];

    for (const file of allFiles) {
      if (!file.content) continue;
      const content = file.content;
      const lines = content.split('\n');
      const maxLines = 30;
      const overlapLines = 4;

      for (let i = 0; i < lines.length; i += (maxLines - overlapLines)) {
        const slice = lines.slice(i, i + maxLines);
        if (slice.length === 0) break;
        const chunkText = slice.join('\n');
        const hash = crypto.createHash('md5')
          .update(`${collectionName}:${file.path}:${i + 1}`)
          .digest('hex');

        chunks.push({
          chunkId: hash,
          text: chunkText,
          filePath: file.path,
          startLine: i + 1,
          endLine: Math.min(lines.length, i + maxLines),
          language: file.path.split('.').pop()?.toLowerCase() || 'text',
          chunkType: 'block',
        });
        if (i + maxLines >= lines.length) break;
      }
    }

    // Delete existing collection and re-create
    try {
      await chroma.deleteCollection(collectionName);
    } catch { /* may not exist */ }
    const collection = await chroma.getOrCreateCollection(collectionName);

    const batchSize = 32;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const ids = batch.map(c => c.chunkId);
      const texts = batch.map(c => c.text);
      const metadatas = batch.map(c => ({
        filePath: c.filePath,
        startLine: c.startLine,
        endLine: c.endLine,
        language: c.language,
        chunkType: c.chunkType,
        repoOwner: resolvedOwner,
        repoName: resolvedRepo,
      }));
      const embeddings = await embeddingService.embed(texts);
      await collection.upsert({ ids, embeddings, metadatas, documents: texts });
    }

    // Update DB status
    await pool.execute(
      `UPDATE indexed_public_repos
       SET status = 'ready', files_count = ?, chunks_count = ?, completed_at = NOW()
       WHERE id = ?`,
      [allFiles.length, chunks.length, dbId]
    );

    res.json({
      status: 'indexed',
      repoId: dbId,
      owner: resolvedOwner,
      repoName: resolvedRepo,
      files_processed: allFiles.length,
      chunks_created: chunks.length,
      collection_name: collectionName,
    });
  } catch (err: any) {
    console.error('Index public repo error:', err);
    if (err?.status === 404) {
      res.status(404).json({ error: 'Repository not found or is private' });
    } else {
      res.status(500).json({ error: 'Failed to index public repo: ' + (err?.message || 'Unknown error') });
    }
  }
}

// GET /api/rag/index-public/repos
// Returns all indexed public repos
export async function getIndexedPublicRepos(req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, owner, repo_name, github_url, chroma_collection_name, files_count, chunks_count, status, indexed_at, completed_at
       FROM indexed_public_repos
       ORDER BY completed_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Get indexed public repos error:', err);
    res.status(500).json({ error: 'Failed to fetch indexed public repos' });
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
