import { Request, Response } from 'express';
import pool from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { generateWeeklyDigest } from '../services/aiService';

export async function getLeaderboard(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT vl.*
     FROM v_developer_leaderboard vl
     WHERE vl.team_id = ?
     ORDER BY vl.team_rank ASC`,
    [id]
  );
  res.json(rows);
}

export async function getTeamAnalytics(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { start, end } = req.query as { start?: string; end?: string };

  const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate   = end   || new Date().toISOString().split('T')[0];

  // Call stored procedure — MySQL does the heavy lifting
  const [rows] = await pool.execute<RowDataPacket[]>(
    'CALL get_team_analytics(?, ?, ?)',
    [id, startDate, endDate]
  );

  // mysql2 returns results in rows[0] for stored procedures
  res.json(Array.isArray(rows[0]) ? rows[0] : rows);
}

export async function getTeamReport(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM v_team_weekly_report WHERE team_id = ?',
    [id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'No report available' }); return; }
  res.json(rows[0]);
}

export async function getWeeklyDigest(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM v_team_weekly_report WHERE team_id = ?',
    [id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'No data available' }); return; }

  const digest = await generateWeeklyDigest(rows[0] as Record<string, unknown>);
  res.json({ digest, report: rows[0] });
}

export async function createTeam(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name: string };
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const ownerId = req.user!.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute<ResultSetHeader>(
      'INSERT INTO teams (name, slug, owner_id) VALUES (?, ?, ?)',
      [name, slug, ownerId]
    );
    await conn.execute(
      'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
      [result.insertId, ownerId, 'admin']
    );
    await conn.commit();
    res.status(201).json({ id: result.insertId, name, slug });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getAlerts(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT al.*, u.name AS developer_name, u.avatar_url
     FROM alert_logs al
     LEFT JOIN users u ON u.id = al.developer_id
     WHERE al.team_id = ? AND al.resolved = FALSE
     ORDER BY al.created_at DESC
     LIMIT 20`,
    [id]
  );
  res.json(rows);
}
