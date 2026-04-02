import { Request, Response } from 'express';
import pool from '../db/connection';
import { RowDataPacket } from 'mysql2';
import crypto from 'crypto';

export async function getReviewHistory(req: Request, res: Response): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, score_overall, language, summary, is_playground, created_at
     FROM reviews
     WHERE developer_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [req.user!.id]
  );
  res.json(rows);
}

export async function getReviewById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const [reviews] = await pool.execute<RowDataPacket[]>(
    `SELECT r.*, u.name as developer_name
     FROM reviews r
     JOIN users u ON u.id = r.developer_id
     WHERE r.id = ? AND r.developer_id = ?`,
    [id, req.user!.id]
  );
  if (!reviews.length) { res.status(404).json({ error: 'Review not found' }); return; }

  const [comments] = await pool.execute<RowDataPacket[]>(
    `SELECT rc.*, GROUP_CONCAT(it.slug) as category_slugs,
            GROUP_CONCAT(it.label) as category_labels
     FROM review_comments rc
     LEFT JOIN comment_categories cc ON cc.comment_id = rc.id
     LEFT JOIN issue_taxonomy it ON it.id = cc.taxonomy_id
     WHERE rc.review_id = ?
     GROUP BY rc.id`,
    [id]
  );

  const review = reviews[0];
  review.comments = (comments as RowDataPacket[]).map(c => ({
    ...c,
    categories: c.category_slugs ? c.category_slugs.split(',') : [],
  }));

  res.json(review);
}

export async function createShareLink(req: Request, res: Response): Promise<void> {
  const { reviewId } = req.body as { reviewId: number };
  
  // Check review belongs to this user or is playground
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM reviews WHERE id = ? AND (developer_id = ? OR is_playground = TRUE)',
    [reviewId, req.user?.id || 1]
  );
  if (!rows.length) { res.status(404).json({ error: 'Review not found' }); return; }

  // Check if share already exists
  const [existing] = await pool.execute<RowDataPacket[]>(
    'SELECT slug FROM review_shares WHERE review_id = ?', [reviewId]
  );
  if (existing.length) { res.json({ slug: existing[0].slug }); return; }

  const slug = crypto.randomBytes(6).toString('base64url').slice(0, 8);
  await pool.execute(
    'INSERT INTO review_shares (review_id, slug) VALUES (?, ?)',
    [reviewId, slug]
  );
  res.json({ slug });
}

export async function getSharedReview(req: Request, res: Response): Promise<void> {
  const { slug } = req.params;
  const [shares] = await pool.execute<RowDataPacket[]>(
    'SELECT review_id FROM review_shares WHERE slug = ?', [slug]
  );
  if (!shares.length) { res.status(404).json({ error: 'Share link not found or expired' }); return; }

  await pool.execute('UPDATE review_shares SET view_count = view_count + 1 WHERE slug = ?', [slug]);

  const reviewId = shares[0].review_id;
  const [reviews] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM reviews WHERE id = ?', [reviewId]
  );
  const [comments] = await pool.execute<RowDataPacket[]>(
    `SELECT rc.*, GROUP_CONCAT(it.slug) as category_slugs
     FROM review_comments rc
     LEFT JOIN comment_categories cc ON cc.comment_id = rc.id
     LEFT JOIN issue_taxonomy it ON it.id = cc.taxonomy_id
     WHERE rc.review_id = ?
     GROUP BY rc.id`,
    [reviewId]
  );

  const review = reviews[0];
  review.comments = (comments as RowDataPacket[]).map(c => ({
    ...c,
    categories: c.category_slugs ? c.category_slugs.split(',') : [],
  }));
  res.json(review);
}

export async function detectLanguage(req: Request, res: Response): Promise<void> {
  const { code } = req.body as { code: string };
  const patterns: [RegExp, string][] = [
    [/import .* from ['"]|export (default|const|function)|const .* = require\(|interface \w+|type \w+ =/, 'typescript'],
    [/def \w+\(|import \w+|from \w+ import|print\(|if __name__/, 'python'],
    [/public (class|static|void)|System\.out\.print|import java\./, 'java'],
    [/func \w+\(|:= |fmt\.Print|package main/, 'go'],
    [/fn \w+\(|let mut |use std::|println!/, 'rust'],
    [/#include <|std::|cout <<|int main\(/, 'cpp'],
    [/SELECT |INSERT INTO|CREATE TABLE|DROP TABLE/i, 'sql'],
    [/<\?php|\$\w+ =|echo |->/, 'php'],
    [/def \w+|puts |require ['"]|\.each do/, 'ruby'],
    [/require .* from ['"]|const .* = require\(|function |var |let |const /, 'javascript'],
  ];
  for (const [pattern, lang] of patterns) {
    if (pattern.test(code)) { res.json({ language: lang }); return; }
  }
  res.json({ language: 'javascript' });
}

export async function updateGoal(req: Request, res: Response): Promise<void> {
  const { score_goal, score_goal_deadline } = req.body as { score_goal: number; score_goal_deadline: string };
  await pool.execute(
    'UPDATE users SET score_goal = ?, score_goal_deadline = ? WHERE id = ?',
    [score_goal, score_goal_deadline, req.user!.id]
  );
  res.json({ success: true });
}

export async function updateStreak(userId: number): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT streak_days, streak_last_date FROM users WHERE id = ?', [userId]
  );
  if (!rows.length) return;

  const today = new Date().toISOString().split('T')[0];
  const lastDate = rows[0].streak_last_date;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let newStreak = 1;
  if (lastDate === yesterday) newStreak = (rows[0].streak_days || 0) + 1;
  else if (lastDate === today) return; // already updated today

  await pool.execute(
    'UPDATE users SET streak_days = ?, streak_last_date = ? WHERE id = ?',
    [newStreak, today, userId]
  );
}
