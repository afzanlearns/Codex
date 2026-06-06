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
import { asyncHandler } from './middleware/asyncHandler';

const ah = asyncHandler;

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
const indexLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many index requests. Please wait before trying again.' });
  },
});

app.use('/api/', apiLimiter);

// ── Auth routes ──────────────────────────────────────────────
app.post('/api/auth/register', ah(register));
app.post('/api/auth/login',    ah(login));
app.get('/api/auth/me',        authenticate, ah(getMe));
app.get('/api/auth/github',          ah(githubRedirect));
app.get('/api/auth/github/callback', ah(githubCallback));

// ── Playground / Code Review ─────────────────────────────────
app.post('/api/playground/review', aiLimiter, playgroundValidators, ah(reviewPlayground));
app.post('/api/reviews/detect-language', ah(detectLanguage));
app.get('/api/reviews/history',        authenticate, ah(getReviewHistory));
app.get('/api/reviews/share/:slug',    optionalAuthenticate, ah(getSharedReview));
app.get('/api/reviews/:id',            authenticate, ah(getReviewById));
app.post('/api/reviews/share',         optionalAuthenticate, ah(createShareLink));

// ── Developer routes ─────────────────────────────────────────
app.get('/api/developers/:id',            authenticate, ah(getDeveloper));
app.get('/api/developers/:id/analytics',  authenticate, ah(getDeveloperAnalytics));
app.get('/api/developers/:id/snapshots',  authenticate, ah(getDeveloperSnapshots));

// ── Team routes ───────────────────────────────────────────────
app.post('/api/teams',                    authenticate, ah(createTeam));
app.get('/api/teams/:id/leaderboard',     authenticate, ah(getLeaderboard));
app.get('/api/teams/:id/analytics',       authenticate, ah(getTeamAnalytics));
app.get('/api/teams/:id/report',          authenticate, ah(getTeamReport));
app.get('/api/teams/:id/digest',          authenticate, ah(getWeeklyDigest));
app.get('/api/teams/:id/alerts',          authenticate, ah(getAlerts));

// ── GitHub repo routes ───────────────────────────────────────
app.get('/api/github/repos',                           authenticate, ah(listGithubRepos));
app.get('/api/github/repos/:owner/:repo/analyze',      authenticate, ah(analyzeRepo));
app.get('/api/github/repos/:repoId/history',           authenticate, ah(getRepoHistory));
app.get('/api/github/repos/:repoId/health',            authenticate, ah(getRepoHealthTrend));
app.post('/api/github/analyze-public',                              ah(analyzePublicRepo));

// ── RAG Index Manager ────────────────────────────────────────
// POST  /api/rag/index               — start indexing a repo
// GET   /api/rag/jobs/:jobId         — poll in-memory job status
// GET   /api/rag/repos               — all repos' index status
// GET   /api/rag/repos/:repoId/status — single repo index status
// DELETE /api/rag/repos/:repoId      — delete an index
// POST  /api/rag/owasp/seed          — (re)seed OWASP corpus
// GET   /api/rag/owasp/status        — check OWASP corpus
app.post('/api/rag/index',                 authenticate, indexLimiter, ah(startIndex));
app.get('/api/rag/jobs/:jobId',            authenticate, ah(getJobStatus));
app.get('/api/rag/repos',                  authenticate, ah(getAllRepoIndexStatuses));
app.get('/api/rag/repos/:repoId/status',   authenticate, ah(getRepoIndexStatus));
app.delete('/api/rag/repos/:repoId',       authenticate, ah(deleteRepoIndex));
app.post('/api/rag/owasp/seed',            authenticate, ah(seedOwasp));
app.get('/api/rag/owasp/status',           authenticate, ah(getOwaspStatus));

// ── Codebase Chat ─────────────────────────────────────────────
// POST /api/chat                — SSE stream: chat with indexed repo
// GET  /api/chat/repos          — repos available for chat
app.get('/api/chat/repos',        authenticate, ah(getChatableRepos));
app.post('/api/chat',             authenticate, aiLimiter, ah(chatWithCodebase));

// ── Refactor Intelligence ─────────────────────────────────────
// POST /api/refactor            — get RAG-grounded refactoring suggestions
app.post('/api/refactor', authenticate, aiLimiter, ah(getRefactorSuggestions));

// ── User settings ────────────────────────────────────────────
app.put('/api/users/goal', authenticate, ah(updateGoal));

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

// ── ChromaDB pre-flight check ────────────────────────────────
async function checkChromaDB(): Promise<void> {
  const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
  try {
    const res = await fetch(`${chromaUrl}/api/v1/heartbeat`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`✅ ChromaDB connected at ${chromaUrl}`);
  } catch {
    console.error('❌ ChromaDB is not running.');
    console.error(`   Expected it at: ${chromaUrl}`);
    console.error('   Start it first in a separate terminal:');
    console.error('     python start_chroma.py');
    console.error('   Then restart the backend.');
    process.exit(1);
  }
}

// ── Boot ─────────────────────────────────────────────────────
async function bootstrap() {
  await checkChromaDB();
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
