import { Request, Response } from 'express';
import pool from '../db/connection';
import { RowDataPacket } from 'mysql2';
import { isMissingDbObject } from '../middleware/asyncHandler';

async function getAnalyticsTrend(developerId: string): Promise<RowDataPacket[]> {
  try {
    const [trend] = await pool.execute<RowDataPacket[]>(
      `SELECT week_start, avg_score, reviews_count, bug_count,
              score_delta, rank_in_team, rank_delta,
              top_issue_slug, rolling_4w_avg
       FROM v_developer_trend
       WHERE developer_id = ?
       ORDER BY week_start ASC`,
      [developerId]
    );
    return trend;
  } catch (err: any) {
    if (!isMissingDbObject(err)) throw err;

    const [fallbackTrend] = await pool.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-01') AS week_start,
              AVG(overall_score) AS avg_score,
              COUNT(*) AS reviews_count,
              SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END) AS bug_count,
              0 AS score_delta,
              NULL AS rank_in_team,
              0 AS rank_delta,
              NULL AS top_issue_slug,
              AVG(overall_score) AS rolling_4w_avg
       FROM reviews
       WHERE user_id = ?
       GROUP BY YEAR(created_at), WEEK(created_at, 1)
       ORDER BY week_start ASC`,
      [developerId]
    );
    return fallbackTrend;
  }
}

async function getSparkline(developerId: string): Promise<RowDataPacket[]> {
  try {
    const [sparkline] = await pool.execute<RowDataPacket[]>(
      `SELECT score, recorded_at
       FROM score_history
       WHERE developer_id = ?
       ORDER BY recorded_at DESC
       LIMIT 30`,
      [developerId]
    );
    return sparkline;
  } catch (err: any) {
    if (!isMissingDbObject(err)) throw err;

    const [fallbackSparkline] = await pool.execute<RowDataPacket[]>(
      `SELECT overall_score AS score, created_at AS recorded_at
       FROM reviews
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 30`,
      [developerId]
    );
    return fallbackSparkline;
  }
}

export async function getDeveloper(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  let rows: RowDataPacket[];
  try {
    [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id, u.name, u.email, u.github_username, u.github_avatar AS avatar_url,
              u.current_score, u.total_reviews,
              CASE
                WHEN u.total_reviews < 5 THEN 'newcomer'
                WHEN u.current_score >= 85 THEN 'consistent'
                WHEN u.current_score >= 70 THEN 'improving'
                WHEN u.current_score >= 50 THEN 'declining'
                ELSE 'pattern_offender'
              END AS badge,
              u.role,
              u.created_at,
              vl.team_rank,
              vl.weekly_delta
       FROM users u
       LEFT JOIN v_developer_leaderboard vl ON vl.id = u.id
       WHERE u.id = ?`,
      [id]
    );
  } catch (err: any) {
    if (!isMissingDbObject(err)) throw err;

    [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id, u.name, u.email, u.github_username, u.github_avatar AS avatar_url,
              u.current_score, u.total_reviews,
              CASE
                WHEN u.total_reviews < 5 THEN 'newcomer'
                WHEN u.current_score >= 85 THEN 'consistent'
                WHEN u.current_score >= 70 THEN 'improving'
                WHEN u.current_score >= 50 THEN 'declining'
                ELSE 'pattern_offender'
              END AS badge,
              u.role,
              u.created_at,
              ROW_NUMBER() OVER (ORDER BY u.current_score DESC, u.created_at ASC) AS team_rank,
              0 AS weekly_delta
       FROM users u
       WHERE u.id = ?`,
      [id]
    );
  }
  if (rows.length === 0) { res.status(404).json({ error: 'Developer not found' }); return; }
  res.json(rows[0]);
}

export async function getDeveloperAnalytics(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const trend = await getAnalyticsTrend(id);
  const sparkline = await getSparkline(id);

  // Top issue categories (last 90 days) using CTE
  const [topIssues] = await pool.execute<RowDataPacket[]>(
    `WITH recent_cats AS (
         SELECT COALESCE(rc.category, rc.severity) AS slug,
                COALESCE(rc.category, rc.severity) AS label,
                rc.severity,
                COUNT(*) AS count
         FROM reviews r
         JOIN review_comments rc ON rc.review_id = r.id
         WHERE r.user_id = ?
           AND r.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         GROUP BY COALESCE(rc.category, rc.severity), rc.severity
     )
     SELECT *, RANK() OVER (ORDER BY count DESC) AS issue_rank
     FROM recent_cats
     ORDER BY count DESC
     LIMIT 5`,
    [id]
  );

  // Recent reviews
  const [recentReviews] = await pool.execute<RowDataPacket[]>(
    `SELECT r.id, r.overall_score AS score_overall, r.summary, r.created_at,
            r.security AS score_security, r.readability AS score_readability, r.correctness AS score_correctness,
            NULL AS pr_title,
            NULL AS pr_number,
            repo.full_name AS repository
     FROM reviews r
     LEFT JOIN repositories repo ON repo.id = r.repo_id
     WHERE r.user_id = ?
     ORDER BY r.created_at DESC
     LIMIT 10`,
    [id]
  );

  // Average score breakdown (all time or recent)
  const [breakdown] = await pool.execute<RowDataPacket[]>(
    `SELECT AVG(correctness) as correctness,
            AVG(security) as security,
            AVG(readability) as readability,
            AVG(performance) as performance,
            AVG(maintainability) as maintainability
     FROM reviews
     WHERE user_id = ?`,
    [id]
  );

  res.json({
    trend: trend.reverse(), // chronological for chart
    sparkline: sparkline.reverse(),
    top_issues: topIssues,
    recent_reviews: recentReviews,
    score_breakdown: breakdown[0] || null
  });
}

export async function getDeveloperSnapshots(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM developer_snapshots
       WHERE developer_id = ?
       ORDER BY week_start DESC
       LIMIT 12`,
      [id]
    );
    res.json(rows);
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      res.json([]);
      return;
    }
    throw err;
  }
}
