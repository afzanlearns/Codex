import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db/connection';
import { reviewCode } from '../services/aiService';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { Octokit } from 'octokit';

// Verify GitHub webhook HMAC signature
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Fetch PR files and diffs from GitHub
async function fetchPRFiles(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<Array<{
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  content?: string;
}>> {
  const octokit = new Octokit({ auth: accessToken });
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner, repo, pull_number: prNumber, per_page: 30,
  });

  // For each modified/added file, also fetch the full content for AI review
  const result = [];
  for (const file of files.slice(0, 15)) { // limit to 15 files
    let content: string | undefined;
    if (file.status !== 'removed' && file.patch) {
      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner, repo, path: file.filename,
          ref: file.sha || 'HEAD',
        });
        if ('content' in fileData && typeof fileData.content === 'string') {
          content = Buffer.from(fileData.content, 'base64').toString('utf-8').slice(0, 8000);
        }
      } catch { /* file might be binary or inaccessible */ }
    }
    result.push({
      filename:  file.filename,
      status:    file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch:     file.patch?.slice(0, 3000),
      content,
    });
  }
  return result;
}

// Post a GitHub Check Run result back to the PR
async function postCheckRun(
  accessToken: string,
  owner: string,
  repo: string,
  headSha: string,
  status: 'queued' | 'in_progress' | 'completed',
  score?: number,
  summary?: string,
  details?: string
): Promise<number> {
  const octokit = new Octokit({ auth: accessToken });

  const grade = score
    ? score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F'
    : undefined;

  const conclusion = score !== undefined
    ? score >= 70 ? 'success' : score >= 50 ? 'neutral' : 'failure'
    : undefined;

  const { data } = await octokit.rest.checks.create({
    owner, repo,
    name:     'Codex AI Review',
    head_sha: headSha,
    status,
    conclusion: status === 'completed' ? conclusion : undefined,
    started_at: new Date().toISOString(),
    completed_at: status === 'completed' ? new Date().toISOString() : undefined,
    output: status === 'completed' ? {
      title:   `Codex Review: Grade ${grade} (${score}/100)`,
      summary: summary || 'AI code review complete.',
      text:    details || '',
    } : {
      title:   'Codex is reviewing this PR...',
      summary: 'AI analysis in progress.',
    },
  });

  return data.id;
}

export async function handleGithubWebhook(req: Request, res: Response): Promise<void> {
  const event     = req.headers['x-github-event'] as string;
  const signature = req.headers['x-hub-signature-256'] as string;
  const rawBody   = JSON.stringify(req.body);

  // Log the raw event for debugging
  await pool.execute(
    'INSERT INTO webhook_events (event_type, repository, payload) VALUES (?, ?, ?)',
    [event, req.body?.repository?.full_name || 'unknown', rawBody]
  ).catch(() => {}); // don't fail if logging fails

  // Only handle pull_request events
  if (event !== 'pull_request') {
    res.status(200).json({ received: true, action: 'ignored', event });
    return;
  }

  const action  = req.body.action as string;
  const pr      = req.body.pull_request;
  const repoData = req.body.repository;

  // Only process when PR is opened or synchronized (new commits pushed)
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    res.status(200).json({ received: true, action: 'ignored', pr_action: action });
    return;
  }

  res.status(200).json({ received: true, processing: true });

  // Process asynchronously so GitHub gets a fast 200 response
  setImmediate(async () => {
    try {
      const owner      = repoData.owner.login;
      const repoName   = repoData.name;
      const fullName   = repoData.full_name;
      const prNumber   = pr.number;
      const headSha    = pr.head.sha;
      const headBranch = pr.head.ref;
      const baseBranch = pr.base.ref;
      const prTitle    = pr.title;
      const authorLogin = pr.user.login;

      // Find the repo in our database
      const [repos] = await pool.execute<RowDataPacket[]>(
        'SELECT r.*, u.github_access_token, u.id as owner_user_id FROM repositories r JOIN teams t ON t.id = r.team_id JOIN users u ON u.id = t.owner_id WHERE r.full_name = ?',
        [fullName]
      );

      if (repos.length === 0) {
        console.log(`[Webhook] Repo ${fullName} not registered in Codex`);
        return;
      }

      const dbRepo      = repos[0];
      const accessToken = dbRepo.github_access_token;
      const repoId      = dbRepo.id;

      // Verify webhook signature if secret is stored
      if (dbRepo.webhook_secret && signature) {
        if (!verifySignature(rawBody, signature, dbRepo.webhook_secret)) {
          console.log('[Webhook] Invalid signature');
          return;
        }
      }

      // Find or create the PR author user
      const [devRows] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM users WHERE github_username = ?',
        [authorLogin]
      );
      const developerId = devRows.length > 0 ? devRows[0].id : dbRepo.owner_user_id;

      // Post "in progress" check to GitHub immediately
      let checkRunId: number | undefined;
      if (accessToken) {
        try {
          checkRunId = await postCheckRun(accessToken, owner, repoName, headSha, 'in_progress');
        } catch (e) {
          console.error('[Webhook] Failed to create check run:', e);
        }
      }

      // Upsert pull request record
      const [prResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO pull_requests
          (repository_id, developer_id, github_pr_id, pr_number, title,
           base_branch, head_branch, state, additions, deletions, changed_files, github_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           state = 'open',
           additions = VALUES(additions),
           deletions = VALUES(deletions),
           changed_files = VALUES(changed_files),
           head_branch = VALUES(head_branch)`,
        [
          repoId, developerId, pr.id, prNumber, prTitle,
          baseBranch, headBranch,
          pr.additions || 0, pr.deletions || 0, pr.changed_files || 0,
          pr.html_url,
        ]
      );

      const prId = prResult.insertId || (await pool.execute<RowDataPacket[]>(
        'SELECT id FROM pull_requests WHERE repository_id = ? AND pr_number = ?',
        [repoId, prNumber]
      ).then(([rows]) => (rows as RowDataPacket[])[0]?.id));

      // Fetch file diffs
      let files: Awaited<ReturnType<typeof fetchPRFiles>> = [];
      if (accessToken) {
        files = await fetchPRFiles(accessToken, owner, repoName, prNumber);
      }

      // Store diffs
      if (files.length > 0) {
        await pool.execute('DELETE FROM pr_file_diffs WHERE pull_request_id = ?', [prId]);
        for (const file of files) {
          await pool.execute(
            `INSERT INTO pr_file_diffs (pull_request_id, filename, status, additions, deletions, patch)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [prId, file.filename, file.status, file.additions, file.deletions, file.patch || null]
          );
        }
      }

      // Get custom rules for this repo
      const [rules] = await pool.execute<RowDataPacket[]>(
        'SELECT rule_text FROM custom_rules WHERE repository_id = ? AND is_active = TRUE',
        [repoId]
      );
      const customRules = rules.map((r: RowDataPacket) => r.rule_text as string);

      // Build code for AI review from all changed files
      const codeForReview = files
        .filter(f => f.content || f.patch)
        .map(f => `// FILE: ${f.filename} (${f.status})\n${f.content || f.patch || ''}`)
        .join('\n\n---\n\n')
        .slice(0, 40000);

      const language = files[0]?.filename.split('.').pop() || 'javascript';

      // Run AI review
      const aiResult = await reviewCode(codeForReview, language, customRules);

      // Convert 0-10 score to 0-100
      const score100 = Math.round((aiResult.scores?.overall ?? 0) * 10);

      // Store review in database (triggers will fire)
      const conn = await pool.getConnection();
      await conn.beginTransaction();
      try {
        const [reviewInsert] = await conn.execute<ResultSetHeader>(
          `INSERT INTO reviews
            (pull_request_id, developer_id, repository_id, is_playground, language,
             score_overall, score_correctness, score_readability, score_security,
             score_performance, score_maintainability, summary, model_used)
           VALUES (?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?, ?, ?, 'llama-3.3-70b-versatile')`,
          [
            prId, developerId, repoId, language,
            aiResult.scores.overall,
            aiResult.scores.correctness,
            aiResult.scores.readability,
            aiResult.scores.security,
            aiResult.scores.performance,
            aiResult.scores.maintainability,
            aiResult.summary,
          ]
        );

        const reviewId = reviewInsert.insertId;

        // Store comments
        for (const comment of aiResult.comments || []) {
          const [commentInsert] = await conn.execute<ResultSetHeader>(
            `INSERT INTO review_comments
              (review_id, filename, line_start, line_end, content, suggestion, severity)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [reviewId, comment.filename || null, comment.line_start || null,
             comment.line_end || null, comment.content, comment.suggestion || null, comment.severity]
          );
          for (const cat of comment.categories || []) {
            const [tax] = await conn.execute<RowDataPacket[]>(
              'SELECT id FROM issue_taxonomy WHERE slug = ?', [cat]
            );
            if ((tax as RowDataPacket[]).length > 0) {
              await conn.execute(
                'INSERT IGNORE INTO comment_categories (comment_id, taxonomy_id) VALUES (?, ?)',
                [commentInsert.insertId, (tax as RowDataPacket[])[0].id]
              );
            }
          }
        }

        await conn.commit();

        // Build GitHub Check Run details text
        const criticals = (aiResult.comments || []).filter(c => c.severity === 'critical' || c.severity === 'high');
        const detailLines = [
          `**Overall Score:** ${score100}/100`,
          `**Grade:** ${score100 >= 85 ? 'A' : score100 >= 70 ? 'B' : score100 >= 50 ? 'C' : score100 >= 30 ? 'D' : 'F'}`,
          '',
          '| Dimension | Score |',
          '|-----------|-------|',
          `| Correctness | ${Math.round(aiResult.scores.correctness * 10)}/100 |`,
          `| Security | ${Math.round(aiResult.scores.security * 10)}/100 |`,
          `| Readability | ${Math.round(aiResult.scores.readability * 10)}/100 |`,
          `| Performance | ${Math.round(aiResult.scores.performance * 10)}/100 |`,
          `| Maintainability | ${Math.round(aiResult.scores.maintainability * 10)}/100 |`,
          '',
          criticals.length > 0 ? `**${criticals.length} high/critical findings:**\n` + criticals.map(c => `- **${c.severity.toUpperCase()}**: ${c.content}`).join('\n') : '**No critical issues found.**',
          '',
          `*Reviewed by [Codex](http://localhost:5173) — AI Code Review Platform*`,
        ].join('\n');

        // Update GitHub Check Run with final result
        if (accessToken && checkRunId) {
          await postCheckRun(
            accessToken, owner, repoName, headSha,
            'completed', score100, aiResult.summary, detailLines
          );

          // Store check run ID
          await pool.execute(
            `INSERT INTO github_check_runs (pull_request_id, review_id, check_run_id, status, conclusion)
             VALUES (?, ?, ?, 'completed', ?)`,
            [prId, reviewId, checkRunId, score100 >= 70 ? 'success' : score100 >= 50 ? 'neutral' : 'failure']
          );
        }

        // Also post a PR review comment with summary
        if (accessToken) {
          const octokit = new Octokit({ auth: accessToken });
          const grade = score100 >= 85 ? 'A' : score100 >= 70 ? 'B' : score100 >= 50 ? 'C' : score100 >= 30 ? 'D' : 'F';
          const emoji = score100 >= 70 ? '✅' : score100 >= 50 ? '⚠️' : '❌';
          await octokit.rest.issues.createComment({
            owner, repo: repoName, issue_number: prNumber,
            body: `## ${emoji} Codex AI Review — Grade ${grade} (${score100}/100)\n\n${aiResult.summary}\n\n${detailLines}\n\n[View full review on Codex →](http://localhost:5173/prs)`,
          });
        }

        console.log(`[Webhook] PR #${prNumber} in ${fullName} reviewed. Score: ${score100}/100`);
      } catch (e) {
        await conn.rollback();
        console.error('[Webhook] Review transaction failed:', e);
        if (accessToken && checkRunId) {
          const octokit = new Octokit({ auth: accessToken });
          await octokit.rest.checks.update({
            owner, repo: repoName, check_run_id: checkRunId,
            status: 'completed', conclusion: 'neutral',
            output: { title: 'Codex Review Error', summary: 'Review failed due to an internal error.' },
          }).catch(() => {});
        }
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error('[Webhook] Unhandled error:', e);
    }
  });
}

// Install webhook on a repo
export async function installWebhook(req: Request, res: Response): Promise<void> {
  const { repoId } = req.body as { repoId: number };

  const [repos] = await pool.execute<RowDataPacket[]>(
    `SELECT r.*, u.github_access_token 
     FROM repositories r 
     CROSS JOIN users u 
     WHERE r.id = ? AND u.id = ?`,
    [repoId, req.user!.id]
  );

  if (!repos.length) { res.status(404).json({ error: 'Repo not found' }); return; }
  const repo = repos[0];

  if (!repo.github_access_token) {
    res.status(400).json({ error: 'GitHub not connected. Sign in with GitHub first.' });
    return;
  }

  const [owner, repoName] = repo.full_name.split('/');
  const webhookSecret = crypto.randomBytes(20).toString('hex');
  const webhookUrl = `${process.env.WEBHOOK_PUBLIC_URL || 'https://your-server.com'}/api/webhooks/github`;

  try {
    const octokit = new Octokit({ auth: repo.github_access_token });
    const { data: hook } = await octokit.rest.repos.createWebhook({
      owner, repo: repoName,
      config: { url: webhookUrl, content_type: 'json', secret: webhookSecret },
      events: ['pull_request'],
      active: true,
    });

    await pool.execute(
      'UPDATE repositories SET github_webhook_id = ?, webhook_secret = ?, webhook_active = TRUE WHERE id = ?',
      [hook.id, webhookSecret, repoId]
    );

    res.json({ success: true, webhook_id: hook.id, message: 'Webhook installed. PRs will now be reviewed automatically.' });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to install webhook: ' + (e?.message || 'Unknown error') });
  }
}

// Get all PRs for the authenticated user's repos
export async function getAllPRs(req: Request, res: Response): Promise<void> {
  const { state, repoId, limit = 50, offset = 0 } = req.query;

  const limitNum  = parseInt(limit as string) || 50;
  const offsetNum = parseInt(offset as string) || 0;

  const [prs] = await pool.query<RowDataPacket[]>(
    `SELECT 
       pr.*,
       r.full_name AS repo_name,
       r.language  AS repo_language,
       r.webhook_active,
       u.name      AS developer_name,
       u.avatar_url,
       u.github_username,
       rev.id           AS review_id,
       rev.score_overall,
       rev.score_security,
       rev.score_correctness,
       rev.summary      AS review_summary,
       rev.created_at   AS reviewed_at,
       gcr.check_run_id,
       gcr.conclusion
     FROM pull_requests pr
     JOIN repositories r   ON r.id  = pr.repository_id
     JOIN team_members tm  ON tm.team_id = r.team_id AND tm.user_id = ?
     JOIN users u          ON u.id  = pr.developer_id
     LEFT JOIN reviews rev ON rev.pull_request_id = pr.id
     LEFT JOIN github_check_runs gcr ON gcr.pull_request_id = pr.id
     WHERE (? IS NULL OR pr.state = ?)
       AND (? IS NULL OR pr.repository_id = ?)
     ORDER BY pr.created_at DESC
     LIMIT ? OFFSET ?`,
    [
      (req as any).user!.id,
      state || null, state || null,
      repoId || null, repoId || null,
      limitNum, offsetNum,
    ]
  );
  res.json(prs);
}

// Get a single PR with full details
export async function getPRDetail(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const [prs] = await pool.execute<RowDataPacket[]>(
    `SELECT pr.*, r.full_name AS repo_name, r.language,
            u.name AS developer_name, u.avatar_url, u.github_username
     FROM pull_requests pr
     JOIN repositories r ON r.id = pr.repository_id
     JOIN users u        ON u.id = pr.developer_id
     WHERE pr.id = ?`,
    [parseInt(id as string)]
  );
  if (!prs.length) { res.status(404).json({ error: 'PR not found' }); return; }

  const [files] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM pr_file_diffs WHERE pull_request_id = ? ORDER BY additions + deletions DESC',
    [id]
  );

  const [reviews] = await pool.execute<RowDataPacket[]>(
    `SELECT r.*, 
            JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', rc.id, 'filename', rc.filename, 'line_start', rc.line_start,
                'content', rc.content, 'suggestion', rc.suggestion, 'severity', rc.severity
              )
            ) AS comments
     FROM reviews r
     LEFT JOIN review_comments rc ON rc.review_id = r.id
     WHERE r.pull_request_id = ?
     GROUP BY r.id
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [id]
  );

  res.json({
    pr:     prs[0],
    files:  files,
    review: reviews[0] || null,
  });
}

// Manually trigger a review on a PR
export async function triggerManualReview(req: Request, res: Response): Promise<void> {
  const { prId } = req.body as { prId: number };

  const [prs] = await pool.execute<RowDataPacket[]>(
    `SELECT pr.*, r.full_name, r.id as repo_id,
            u.github_access_token
     FROM pull_requests pr
     JOIN repositories r ON r.id = pr.repository_id
     JOIN teams t        ON t.id = r.team_id
     JOIN users u        ON u.id = t.owner_id
     WHERE pr.id = ?`,
    [parseInt(String(prId))]
  );

  if (!prs.length) { res.status(404).json({ error: 'PR not found' }); return; }

  res.json({ message: 'Review triggered. Refresh in a moment.' });

  // Async review
  setImmediate(async () => {
    const pr          = prs[0];
    const accessToken = pr.github_access_token;
    if (!accessToken) return;

    const [owner, repoName] = pr.full_name.split('/');
    const files = await fetchPRFiles(accessToken, owner, repoName, pr.pr_number);
    const code  = files.map(f => `// ${f.filename}\n${f.content || f.patch || ''}`).join('\n\n').slice(0, 40000);
    const lang  = files[0]?.filename.split('.').pop() || 'javascript';

    const [rules] = await pool.execute<RowDataPacket[]>(
      'SELECT rule_text FROM custom_rules WHERE repository_id = ? AND is_active = TRUE',
      [pr.repo_id]
    );
    const aiResult = await reviewCode(code, lang, rules.map((r: RowDataPacket) => r.rule_text as string));

    await pool.execute(
      `INSERT INTO reviews (pull_request_id, developer_id, repository_id, is_playground, language,
         score_overall, score_correctness, score_readability, score_security,
         score_performance, score_maintainability, summary, model_used)
       VALUES (?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?, ?, ?, 'llama-3.3-70b-versatile')`,
      [prId, req.user!.id, pr.repo_id, lang,
       aiResult.scores.overall, aiResult.scores.correctness, aiResult.scores.readability,
       aiResult.scores.security, aiResult.scores.performance, aiResult.scores.maintainability,
       aiResult.summary]
    );
  });
}
