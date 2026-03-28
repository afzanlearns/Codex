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
    'SELECT id, name, email, password_hash, role, current_score, badge, avatar_url FROM users WHERE email = ?',
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
    },
  });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, email, github_username, avatar_url,
            current_score, total_reviews, badge, role, created_at
     FROM users WHERE id = ?`,
    [req.user!.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(rows[0]);
}
