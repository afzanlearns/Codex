import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db/connection';
import { reviewCode as aiReviewCode } from '../services/aiService';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export async function getReviewHistory(req: Request, res: Response): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, overall_score AS score_overall, language, summary, created_at
     FROM reviews
     WHERE user_id = ?
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
     JOIN users u ON u.id = r.user_id
     WHERE r.id = ? AND r.user_id = ?`,
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

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM reviews WHERE id = ? AND (user_id = ? OR is_playground = TRUE)',
    [reviewId, req.user?.id || 1]
  );
  if (!rows.length) { res.status(404).json({ error: 'Review not found' }); return; }

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
  try {
    await pool.execute(
      'UPDATE users SET score_goal = ?, score_goal_deadline = ? WHERE id = ?',
      [score_goal, score_goal_deadline, req.user!.id]
    );
    res.json({ success: true });
  } catch (err: any) {
    if (err?.code === 'ER_BAD_FIELD_ERROR') {
      res.status(501).json({ error: 'Goal tracking is not available on this database schema yet.' });
      return;
    }
    throw err;
  }
}

export const reviewValidators = [
  body('code').isString().isLength({ min: 10, max: 50000 }).withMessage('Code must be 10–50000 characters'),
  body('language').isString().isLength({ min: 1, max: 50 }).withMessage('Language is required'),
  body('rules').optional().isArray({ max: 20 }),
];

export async function reviewCode(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return;
  }

  const { code, language, rules = [] } = req.body as {
    code: string;
    language: string;
    rules?: string[];
  };

  // Use authenticated user ID or a guest placeholder (1)
  let developerId = 1;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as any;
      if (decoded && decoded.id) developerId = decoded.id;
    } catch (e) {
      console.warn('Review token verify failed:', e);
    }
  }

  const aiResult = await aiReviewCode(code, language, rules, undefined, developerId === 1 ? undefined : developerId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Insert review record
    const [reviewInsert] = await conn.execute<ResultSetHeader>(
      `INSERT INTO reviews
        (user_id, language,
         overall_score, correctness, readability,
         security, performance, maintainability,
         summary, rag_context_used, retrieval_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        developerId, language,
        aiResult.scores.overall, aiResult.scores.correctness,
        aiResult.scores.readability, aiResult.scores.security,
        aiResult.scores.performance, aiResult.scores.maintainability,
        aiResult.summary, aiResult.ragContext ? true : false,
        aiResult.ragContext?.chunksRetrieved || 0
      ]
    );

    const reviewId = reviewInsert.insertId;

    // Insert all comments
    for (const comment of aiResult.comments) {
      const [commentInsert] = await conn.execute<ResultSetHeader>(
        `INSERT INTO review_comments
          (review_id, severity, description, line_number, suggestion)
         VALUES (?, ?, ?, ?, ?)`,
        [
          reviewId,
          comment.severity,
          comment.content,
          comment.line_start || null,
          comment.suggestion || null,
        ]
      );
    }

    await conn.commit();

    // Update user's daily streak
    updateStreak(developerId).catch(console.error);

    res.status(200).json({
      review_id:       reviewId,
      scores:          aiResult.scores,
      summary:         aiResult.summary,
      grade:           aiResult.grade,
      risk_level:      aiResult.risk_level,
      strengths:       aiResult.strengths       || [],
      critical_issues: aiResult.critical_issues || [],
      improvements:    aiResult.improvements    || [],
      comments:        aiResult.comments,
      metrics:         aiResult.metrics         || {},
      rag_context:     aiResult.ragContext       || null,
      citation_map:    aiResult.citationMap      || null,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
  else if (lastDate === today) return;

  await pool.execute(
    'UPDATE users SET streak_days = ?, streak_last_date = ? WHERE id = ?',
    [newStreak, today, userId]
  );
}
