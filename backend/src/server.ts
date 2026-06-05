import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { testConnection } from './db/connection';

// Controllers — Auth
import { register, login, getMe, githubRedirect, githubCallback } from './controllers/authController';

// Controllers — Core Review
import { reviewPlayground, playgroundValidators } from './controllers/playgroundController';
import { getReviewHistory, getReviewById, createShareLink, getSharedReview, detectLanguage, updateGoal } from './controllers/reviewController';

// Controllers — Developer & Team
import { getDeveloper, getDeveloperAnalytics, getDeveloperSnapshots } from './controllers/developerController';
import { getLeaderboard, getTeamAnalytics, getTeamReport, getWeeklyDigest, createTeam, getAlerts } from './controllers/teamController';

// Controllers — GitHub Repos
import { listGithubRepos, analyzeRepo, analyzePublicRepo, getRepoHistory, getRepoHealthTrend } from './controllers/repoController';

// Controllers — RAG (Phase 4: new)
import {
  startIndex,
  getJobStatus,
  getRepoIndexStatus,
  getAllRepoIndexStatuses,
  deleteRepoIndex,
  seedOwasp,
  getOwaspStatus,
} from './controllers/ragController';

// Controllers — Codebase Chat (Phase 4: new)
import { chatWithCodebase, getChatableRepos } from './controllers/chatController';

// Controllers — Refactor Intelligence (Phase 4: new)
import { getRefactorSuggestions } from './controllers/refactorController';

// Middleware
import { authenticate, optionalAuthenticate } from './middleware/auth';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Core middleware ──────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ────────────────────────────────────────────
const apiLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const aiLimiter    = rateLimit({ windowMs: 60 * 1000, max: 10,  message: 'Too many AI requests, slow down.' });
const indexLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5,   message: 'Too many index requests per hour.' });

app.use('/api/', apiLimiter);

// ── Auth routes ──────────────────────────────────────────────
app.post('/api/auth/register', register);
app.post('/api/auth/login',    login);
app.get('/api/auth/me',        authenticate, getMe);
app.get('/api/auth/github',          githubRedirect);
app.get('/api/auth/github/callback', githubCallback);

// ── Playground / Code Review ─────────────────────────────────
app.post('/api/playground/review', aiLimiter, playgroundValidators, reviewPlayground);
app.post('/api/reviews/detect-language', detectLanguage);
app.get('/api/reviews/history',        authenticate, getReviewHistory);
app.get('/api/reviews/share/:slug',    optionalAuthenticate, getSharedReview);
app.get('/api/reviews/:id',            authenticate, getReviewById);
app.post('/api/reviews/share',         optionalAuthenticate, createShareLink);

// ── Developer routes ─────────────────────────────────────────
app.get('/api/developers/:id',            authenticate, getDeveloper);
app.get('/api/developers/:id/analytics',  authenticate, getDeveloperAnalytics);
app.get('/api/developers/:id/snapshots',  authenticate, getDeveloperSnapshots);

// ── Team routes ───────────────────────────────────────────────
app.post('/api/teams',                    authenticate, createTeam);
app.get('/api/teams/:id/leaderboard',     authenticate, getLeaderboard);
app.get('/api/teams/:id/analytics',       authenticate, getTeamAnalytics);
app.get('/api/teams/:id/report',          authenticate, getTeamReport);
app.get('/api/teams/:id/digest',          authenticate, getWeeklyDigest);
app.get('/api/teams/:id/alerts',          authenticate, getAlerts);

// ── GitHub repo routes ───────────────────────────────────────
app.get('/api/github/repos',                           authenticate, listGithubRepos);
app.get('/api/github/repos/:owner/:repo/analyze',      authenticate, analyzeRepo);
app.get('/api/github/repos/:repoId/history',           authenticate, getRepoHistory);
app.get('/api/github/repos/:repoId/health',            authenticate, getRepoHealthTrend);
app.post('/api/github/analyze-public',                              analyzePublicRepo);

// ── RAG Index Manager ────────────────────────────────────────
// POST  /api/rag/index               — start indexing a repo
// GET   /api/rag/jobs/:jobId         — poll in-memory job status
// GET   /api/rag/repos               — all repos' index status
// GET   /api/rag/repos/:repoId/status — single repo index status
// DELETE /api/rag/repos/:repoId      — delete an index
// POST  /api/rag/owasp/seed          — (re)seed OWASP corpus
// GET   /api/rag/owasp/status        — check OWASP corpus
app.post('/api/rag/index',                 authenticate, indexLimiter, startIndex);
app.get('/api/rag/jobs/:jobId',            authenticate, getJobStatus);
app.get('/api/rag/repos',                  authenticate, getAllRepoIndexStatuses);
app.get('/api/rag/repos/:repoId/status',   authenticate, getRepoIndexStatus);
app.delete('/api/rag/repos/:repoId',       authenticate, deleteRepoIndex);
app.post('/api/rag/owasp/seed',            authenticate, seedOwasp);
app.get('/api/rag/owasp/status',           authenticate, getOwaspStatus);

// ── Codebase Chat ─────────────────────────────────────────────
// POST /api/chat                — SSE stream: chat with indexed repo
// GET  /api/chat/repos          — repos available for chat
app.get('/api/chat/repos',        authenticate, getChatableRepos);
app.post('/api/chat',             authenticate, aiLimiter, chatWithCodebase);

// ── Refactor Intelligence ─────────────────────────────────────
// POST /api/refactor            — get RAG-grounded refactoring suggestions
app.post('/api/refactor', authenticate, aiLimiter, getRefactorSuggestions);

// ── User settings ────────────────────────────────────────────
app.put('/api/users/goal', authenticate, updateGoal);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '2.0.0',
}));

// ── Global error handler ─────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Boot ─────────────────────────────────────────────────────
async function bootstrap() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`🚀 Codex 2.0 API running on http://localhost:${PORT}`);
    console.log(`📚 RAG endpoints: /api/rag/*, /api/chat, /api/refactor`);
  });
}

bootstrap().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
