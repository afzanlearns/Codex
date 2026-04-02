import { Request, Response } from 'express';
import pool from '../db/connection';
import { getUserRepos, getRepoStructure } from '../services/githubService';
import { analyzeCodebase } from '../services/aiService';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

async function getAccessToken(userId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT github_access_token FROM users WHERE id = ?', [userId]
  );
  return rows[0]?.github_access_token || null;
}

export async function listGithubRepos(req: Request, res: Response): Promise<void> {
  const token = await getAccessToken(req.user!.id);
  if (!token) {
    res.status(400).json({ error: 'GitHub account not connected. Sign in with GitHub first.' });
    return;
  }
  try {
    const githubRepos = await getUserRepos(token);

    // Fetch existing repo records from our database to check for webhook status
    const fullNames = githubRepos.map((r: any) => r.full_name);
    if (fullNames.length === 0) {
      res.json([]);
      return;
    }

    const [dbRepos] = await pool.query<RowDataPacket[]>(
      'SELECT id, full_name, webhook_active FROM repositories WHERE full_name IN (?)',
      [fullNames]
    );

    const dbMap = new Map(dbRepos.map(r => [r.full_name, r]));

    const result = githubRepos.map((r: any) => {
      const dbRepo = dbMap.get(r.full_name);
      return {
        ...r,
        codex_repo_id:  dbRepo ? dbRepo.id : null,
        webhook_active: dbRepo ? dbRepo.webhook_active : false,
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch GitHub repos. Token may be expired.' });
  }
}

export async function analyzeRepo(req: Request, res: Response): Promise<void> {
  const owner = req.params.owner as string;
  const repo = req.params.repo as string;
  const token = await getAccessToken(req.user!.id);
  if (!token) {
    res.status(400).json({ error: 'GitHub account not connected.' });
    return;
  }

  try {
    const structure  = await getRepoStructure(token, owner, repo);
    const analysis   = await analyzeCodebase(structure);

    // Check if repo exists in our DB, insert if not
    const [existing] = await pool.execute(
      'SELECT id FROM repositories WHERE full_name = ?', [structure.full_name]
    ) as [RowDataPacket[], any];

    let repoId: number;
    if (existing.length > 0) {
      repoId = existing[0].id;
      await pool.execute(
        `UPDATE repositories SET health_score = ?, last_analyzed_at = NOW(),
         file_count = ?, primary_language = ?
         WHERE id = ?`,
        [analysis.scores.overall, structure.file_count, structure.language || null, repoId]
      );
    } else {
      const [result] = await pool.execute(
        `INSERT INTO repositories (team_id, full_name, url, language, health_score, 
         last_analyzed_at, file_count, primary_language)
         VALUES (1, ?, ?, ?, ?, NOW(), ?, ?)`,
        [
          structure.full_name,
          `https://github.com/${structure.full_name}`,
          structure.language || null,
          analysis.scores.overall,
          structure.file_count,
          structure.language || null,
        ]
      ) as [ResultSetHeader, any];
      repoId = result.insertId;
    }

    // Store the analysis
    await pool.execute(
      `INSERT INTO repo_analyses 
       (repository_id, developer_id, health_score, file_count, languages,
        summary, strengths, critical_issues, recommendations, raw_structure)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        repoId,
        req.user!.id,
        analysis.scores.overall,
        structure.file_count,
        JSON.stringify(structure.languages),
        analysis.summary,
        JSON.stringify(analysis.strengths),
        JSON.stringify(analysis.critical_issues),
        JSON.stringify(analysis.recommendations),
        JSON.stringify(structure.files.slice(0, 100)),
      ]
    );

    res.json({
      repo:     structure,
      analysis,
      repo_id:  repoId,
    });
  } catch (e) {
    console.error('Repo analysis error:', e);
    res.status(500).json({ error: 'Analysis failed. ' + (e instanceof Error ? e.message : '') });
  }
}

export async function analyzePublicRepo(req: Request, res: Response): Promise<void> {
  const { url } = req.body as { url: string };

  // Parse owner/repo from URL
  // Accepts: https://github.com/owner/repo, owner/repo, github.com/owner/repo
  let owner = '';
  let repo  = '';

  try {
    const clean = url.trim().replace(/\.git$/, '');
    const match = clean.match(/(?:github\.com\/)?([^/\s]+)\/([^/\s]+)/);
    if (!match) throw new Error('Invalid GitHub URL format');
    owner = match[1];
    repo  = match[2];
  } catch {
    res.status(400).json({ error: 'Invalid GitHub URL. Use: https://github.com/owner/repo or owner/repo' });
    return;
  }

  // Use a public (unauthenticated) Octokit for public repos
  // Rate limit: 60 req/hr unauthenticated — acceptable for demo
  try {
    const { Octokit } = await import('octokit');
    const octokit = new Octokit();  // no auth = public access only

    // Verify repo exists and is public
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    if (repoData.private) {
      res.status(403).json({ error: 'This repository is private. Connect your GitHub account to analyze private repos.' });
      return;
    }

    // Reuse the existing getRepoStructure but with no auth token
    const { getRepoStructure } = await import('../services/githubService');
    const structure = await getRepoStructure('', owner, repo);
    const { analyzeCodebase } = await import('../services/aiService');
    const analysis = await analyzeCodebase(structure);

    // Store in DB without user auth (use guest user id 1)
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM repositories WHERE full_name = ?',
      [structure.full_name]
    );

    let repoId: number;
    if (existing.length > 0) {
      repoId = existing[0].id;
    } else {
      const sql = 'INSERT INTO repositories (team_id, full_name, url, language, health_score, last_analyzed_at, file_count, primary_language) VALUES (1, ?, ?, ?, ?, NOW(), ?, ?)';
      const values = [structure.full_name, `https://github.com/${structure.full_name}`, structure.language || null, analysis.scores.overall, structure.file_count, structure.language || null];
      const [result] = await pool.execute<ResultSetHeader>(sql, values);
      repoId = result.insertId;
    }

    await pool.execute(
      `INSERT INTO repo_analyses (repository_id, developer_id, health_score, file_count, languages, summary, strengths, critical_issues, recommendations, raw_structure)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [repoId, analysis.scores.overall, structure.file_count, JSON.stringify(structure.languages),
       analysis.summary, JSON.stringify(analysis.strengths), JSON.stringify(analysis.critical_issues),
       JSON.stringify(analysis.recommendations), JSON.stringify(structure.files.slice(0, 100))]
    );

    res.json({ repo: structure, analysis, repo_id: repoId, is_public: true });
  } catch (e: any) {
    if (e?.status === 404) {
      res.status(404).json({ error: 'Repository not found. Check the URL and make sure it is public.' });
    } else {
      res.status(500).json({ error: 'Analysis failed: ' + (e?.message || 'Unknown error') });
    }
  }
}

export async function getRepoHistory(req: Request, res: Response): Promise<void> {
  const { repoId } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ra.*, u.name as analyzed_by
     FROM repo_analyses ra
     JOIN users u ON u.id = ra.developer_id
     WHERE ra.repository_id = ?
     ORDER BY ra.created_at DESC
     LIMIT 20`,
    [repoId]
  );
  res.json(rows);
}

export async function getRepoHealthTrend(req: Request, res: Response): Promise<void> {
  const { repoId } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT health_score, file_count, created_at
     FROM repo_analyses
     WHERE repository_id = ?
     ORDER BY created_at ASC
     LIMIT 30`,
    [repoId]
  );
  res.json(rows);
}
