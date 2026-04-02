import { Request, Response } from 'express';
import pool from '../db/connection';
import { RowDataPacket } from 'mysql2';

export async function getDeveloper(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.id, u.name, u.email, u.github_username, u.avatar_url,
            u.current_score, u.total_reviews, u.badge, u.role,
            u.created_at,
            -- Window function: rank within team
            vl.team_rank,
            vl.weekly_delta
     FROM users u
     LEFT JOIN v_developer_leaderboard vl ON vl.id = u.id
     WHERE u.id = ?`,
    [id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Developer not found' }); return; }
  res.json(rows[0]);
}

export async function getDeveloperAnalytics(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  // 8-week trend from the view (uses window functions internally)
  const [trend] = await pool.execute<RowDataPacket[]>(
    `SELECT week_start, avg_score, reviews_count, bug_count,
            score_delta, rank_in_team, rank_delta,
            top_issue_slug, rolling_4w_avg
     FROM v_developer_trend
     WHERE developer_id = ?
     ORDER BY week_start ASC`,
    [id]
  );

  // Score history for sparkline (last 30 reviews)
  const [sparkline] = await pool.execute<RowDataPacket[]>(
    `SELECT score, recorded_at
     FROM score_history
     WHERE developer_id = ?
     ORDER BY recorded_at DESC
     LIMIT 30`,
    [id]
  );

  // Top issue categories (last 90 days) using CTE
  const [topIssues] = await pool.execute<RowDataPacket[]>(
    `WITH recent_cats AS (
         SELECT it.slug, it.label, it.severity, COUNT(*) AS count
         FROM reviews r
         JOIN review_comments rc ON rc.review_id = r.id
         JOIN comment_categories cc ON cc.comment_id = rc.id
         JOIN issue_taxonomy it ON it.id = cc.taxonomy_id
         WHERE r.developer_id = ?
           AND r.is_playground = FALSE
           AND r.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         GROUP BY it.slug, it.label, it.severity
     )
     SELECT *, RANK() OVER (ORDER BY count DESC) AS issue_rank
     FROM recent_cats
     ORDER BY count DESC
     LIMIT 5`,
    [id]
  );

  // Recent reviews
  const [recentReviews] = await pool.execute<RowDataPacket[]>(
    `SELECT r.id, r.score_overall, r.summary, r.created_at,
            r.score_security, r.score_readability, r.score_correctness,
            pr.title AS pr_title, pr.pr_number,
            repo.full_name AS repository
     FROM reviews r
     LEFT JOIN pull_requests pr ON pr.id = r.pull_request_id
     LEFT JOIN repositories repo ON repo.id = r.repository_id
     WHERE r.developer_id = ?
       AND r.is_playground = FALSE
     ORDER BY r.created_at DESC
     LIMIT 10`,
    [id]
  );

  // Average score breakdown (all time or recent)
  const [breakdown] = await pool.execute<RowDataPacket[]>(
    `SELECT AVG(score_correctness) as correctness,
            AVG(score_security) as security,
            AVG(score_readability) as readability,
            AVG(score_performance) as performance,
            AVG(score_maintainability) as maintainability
     FROM reviews
     WHERE developer_id = ? AND is_playground = FALSE`,
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
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM developer_snapshots
     WHERE developer_id = ?
     ORDER BY week_start DESC
     LIMIT 12`,
    [id]
  );
  res.json(rows);
}
