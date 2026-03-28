import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { testConnection } from './db/connection';

// Controllers
import { register, login, getMe }               from './controllers/authController';
import { reviewPlayground, playgroundValidators } from './controllers/playgroundController';
import { getDeveloper, getDeveloperAnalytics, getDeveloperSnapshots } from './controllers/developerController';
import { getLeaderboard, getTeamAnalytics, getTeamReport, getWeeklyDigest, createTeam, getAlerts } from './controllers/teamController';

// Middleware
import { authenticate } from './middleware/auth';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Core middleware ──────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const aiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 10, message: 'Too many AI requests, slow down.' });

app.use('/api/', apiLimiter);

// ── Global error handler ─────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Auth routes ──────────────────────────────────────────────
app.post('/api/auth/register', register);
app.post('/api/auth/login',    login);
app.get('/api/auth/me',        authenticate, getMe);

// ── Playground route (no auth required for demo) ─────────────
app.post('/api/playground/review', aiLimiter, playgroundValidators, reviewPlayground);

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

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Boot ─────────────────────────────────────────────────────
async function bootstrap() {
  await testConnection();
  app.listen(PORT, () => console.log(`🚀 Codex API running on http://localhost:${PORT}`));
}

bootstrap().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
