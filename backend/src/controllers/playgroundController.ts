import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db/connection';
import { reviewCode } from '../services/aiService';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import jwt from 'jsonwebtoken';
import { updateStreak } from './reviewController';

export const playgroundValidators = [
  body('code').isString().isLength({ min: 10, max: 50000 }).withMessage('Code must be 10–50000 characters'),
  body('language').isString().isLength({ min: 1, max: 50 }).withMessage('Language is required'),
  body('rules').optional().isArray({ max: 20 }),
];

export async function reviewPlayground(req: Request, res: Response): Promise<void> {
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
      console.warn('Playground token verify failed:', e);
    }
  }

  const aiResult = await reviewCode(code, language, rules);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Insert review record
    const [reviewInsert] = await conn.execute<ResultSetHeader>(
      `INSERT INTO reviews
        (developer_id, is_playground, language,
         score_overall, score_correctness, score_readability,
         score_security, score_performance, score_maintainability,
         summary, model_used, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'claude-sonnet-4-20250514',
               DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [
        developerId, developerId === 1 ? true : false, language,
        aiResult.scores.overall, aiResult.scores.correctness,
        aiResult.scores.readability, aiResult.scores.security,
        aiResult.scores.performance, aiResult.scores.maintainability,
        aiResult.summary
      ]
    );

    const reviewId = reviewInsert.insertId;

    // Insert all comments
    for (const comment of aiResult.comments) {
      const [commentInsert] = await conn.execute<ResultSetHeader>(
        `INSERT INTO review_comments
          (review_id, filename, line_start, line_end, content, suggestion, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          reviewId,
          comment.filename || null,
          comment.line_start || null,
          comment.line_end || null,
          comment.content,
          comment.suggestion || null,
          comment.severity
        ]
      );

      // Insert comment categories
      for (const categorySlug of comment.categories) {
        const [taxonomy] = await conn.execute<RowDataPacket[]>(
          'SELECT id FROM issue_taxonomy WHERE slug = ?',
          [categorySlug]
        );
        if (taxonomy.length > 0) {
          await conn.execute(
            'INSERT IGNORE INTO comment_categories (comment_id, taxonomy_id) VALUES (?, ?)',
            [commentInsert.insertId, taxonomy[0].id]
          );
        }
      }
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
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
