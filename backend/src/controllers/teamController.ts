import { Request, Response } from 'express';
import pool from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { generateWeeklyDigest } from '../services/aiService';
import { isMissingDbObject } from '../middleware/asyncHandler';

export async function getLeaderboard(req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT vl.*
       FROM v_developer_leaderboard vl
       ORDER BY vl.team_rank ASC`,
      []
    );
    res.json(rows);
  } catch (err: any) {
    if (!isMissingDbObject(err)) throw err;

    const [fallbackRows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id,
              u.name,
              u.github_avatar AS avatar_url,
              CASE
                WHEN u.total_reviews < 5 THEN 'newcomer'
                WHEN u.current_score >= 85 THEN 'consistent'
                WHEN u.current_score >= 70 THEN 'improving'
                WHEN u.current_score >= 50 THEN 'declining'
                ELSE 'pattern_offender'
              END AS badge,
              u.current_score,
              u.total_reviews,
              ROW_NUMBER() OVER (ORDER BY u.current_score DESC, u.created_at ASC) AS team_rank,
              0 AS weekly_delta
       FROM users u
       ORDER BY team_rank ASC`
    );
    res.json(fallbackRows);
  }
}

export async function getTeamAnalytics(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { start, end } = req.query as { start?: string; end?: string };

  const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate   = end   || new Date().toISOString().split('T')[0];

  try {
    // Call stored procedure — MySQL does the heavy lifting
    const [rows] = await pool.execute<RowDataPacket[]>(
      'CALL get_team_analytics(?, ?, ?)',
      [id, startDate, endDate]
    );

    // mysql2 returns results in rows[0] for stored procedures
    res.json(Array.isArray(rows[0]) ? rows[0] : rows);
  } catch (err: any) {
    if (!isMissingDbObject(err)) throw err;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DATE(r.created_at) AS day,
              COUNT(*) AS reviews_count,
              AVG(r.overall_score) AS avg_score,
              SUM(CASE WHEN r.risk_level IN ('high','critical') THEN 1 ELSE 0 END) AS security_findings
       FROM reviews r
       WHERE r.created_at BETWEEN ? AND ?
       GROUP BY DATE(r.created_at)
       ORDER BY day ASC`,
      [startDate, endDate]
    );
    res.json(rows);
  }
}

export async function getTeamReport(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM v_team_weekly_report WHERE team_id = ?',
      [id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'No report available' }); return; }
    res.json(rows[0]);
  } catch (err: any) {
    if (!isMissingDbObject(err)) throw err;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS reviews_count,
              AVG(overall_score) AS avg_score,
              SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END) AS security_findings,
              MIN(created_at) AS period_start,
              MAX(created_at) AS period_end
       FROM reviews`
    );
    if (!rows.length) { res.status(404).json({ error: 'No report available' }); return; }
    res.json(rows[0]);
  }
}

export async function getWeeklyDigest(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM v_team_weekly_report WHERE team_id = ?',
      [id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'No data available' }); return; }

    const digest = await generateWeeklyDigest(rows[0] as Record<string, unknown>);
    res.json({ digest, report: rows[0] });
  } catch (err: any) {
    if (!isMissingDbObject(err)) throw err;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS reviews_count,
              AVG(overall_score) AS avg_score,
              SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END) AS security_findings,
              MIN(created_at) AS period_start,
              MAX(created_at) AS period_end
       FROM reviews`
    );
    if (!rows.length) { res.status(404).json({ error: 'No data available' }); return; }

    const digest = await generateWeeklyDigest(rows[0] as Record<string, unknown>);
    res.json({ digest, report: rows[0] });
  }
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
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT al.*, u.name AS developer_name, u.github_avatar AS avatar_url
       FROM alert_logs al
       LEFT JOIN users u ON u.id = al.developer_id
       WHERE al.team_id = ? AND al.resolved = FALSE
       ORDER BY al.created_at DESC
       LIMIT 20`,
      [id]
    );
    res.json(rows);
  } catch (err: any) {
    if (isMissingDbObject(err)) {
      res.json([]);
      return;
    }
    throw err;
  }
}
