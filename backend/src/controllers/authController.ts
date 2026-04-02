import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/connection';
import { generateToken } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body as { name: string; email: string; password: string };

  const [existing] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM users WHERE email = ?', [email]
  );
  if (existing.length > 0) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    [name, email, hash]
  );

  const token = generateToken({ id: result.insertId, email, role: 'developer' });
  res.status(201).json({ token, user: { id: result.insertId, name, email, role: 'developer' } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, name, email, password_hash, role, current_score, badge, avatar_url, score_goal, score_goal_deadline FROM users WHERE email = ?',
    [email]
  );

  if (rows.length === 0) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash || '');
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      current_score: user.current_score,
      badge: user.badge,
      avatar_url: user.avatar_url,
      score_goal: user.score_goal,
      score_goal_deadline: user.score_goal_deadline,
    },
  });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, email, github_username, avatar_url,
            current_score, total_reviews, badge, role, created_at,
            score_goal, score_goal_deadline
     FROM users WHERE id = ?`,
    [req.user!.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(rows[0]);
}

export async function githubRedirect(_req: Request, res: Response): Promise<void> {
  const params = new URLSearchParams({
    client_id:    process.env.GITHUB_CLIENT_ID || '',
    redirect_uri: 'http://localhost:3001/api/auth/github/callback',
    scope:        'user:email read:user repo',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

export async function githubCallback(req: Request, res: Response): Promise<void> {
  const { code } = req.query as { code: string };
  const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!code) {
    res.redirect(`${FRONTEND}/login?error=no_code`);
    return;
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id:     process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };

    if (!tokenData.access_token) {
      res.redirect(`${FRONTEND}/login?error=token_failed`);
      return;
    }

    const accessToken = tokenData.access_token;

    // Fetch GitHub user profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Codex-App' },
    });
    const ghUser = await userRes.json() as {
      id: number; name: string; login: string; avatar_url: string;
    };

    // Fetch primary email
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Codex-App' },
    });
    const emails   = await emailRes.json() as { email: string; primary: boolean; verified: boolean }[];
    const primary  = emails.find(e => e.primary && e.verified);
    const email    = primary?.email || `${ghUser.login}@github.local`;

    // Upsert user
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id, role FROM users WHERE github_id = ? OR email = ? LIMIT 1',
      [ghUser.id, email]
    );

    let userId: number;
    let role = 'developer';

    if (existing.length > 0) {
      userId = existing[0].id;
      role   = existing[0].role;
      await pool.execute(
        'UPDATE users SET github_id = ?, github_username = ?, avatar_url = ?, github_access_token = ? WHERE id = ?',
        [ghUser.id, ghUser.login, ghUser.avatar_url, accessToken, userId]
      );
    } else {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO users (name, email, github_id, github_username, avatar_url, github_access_token)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ghUser.name || ghUser.login, email, ghUser.id, ghUser.login, ghUser.avatar_url, accessToken]
      );
      userId = result.insertId;
    }

    const token = generateToken({ id: userId, email, role });
    res.redirect(`${FRONTEND}/auth/callback?token=${token}`);

  } catch (err) {
    console.error('GitHub OAuth error:', err);
    res.redirect(`${FRONTEND}/login?error=oauth_failed`);
  }
}
