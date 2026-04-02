# CODEX — AI Code Review Platform

> Full-stack AI-powered code review SaaS built as a DBMS Mini Project.
> MySQL is the intelligence engine — not just storage.

---

## What is Codex?

Codex is a production-grade AI code review platform that automatically reviews
pull requests, analyzes entire codebases, scores developers over time, and
surfaces team-wide insights. Every meaningful operation — scoring, ranking,
alerting, pattern detection, PR review, weekly reporting — runs inside MySQL
through stored procedures, triggers, views, and window functions.

It is built to feel and function like a real SaaS product, not a student project.

---

## Tech Stack

| Layer         | Technology                                    |
|---------------|-----------------------------------------------|
| Frontend      | React 18 + TypeScript + Vite                  |
| Styling       | Geist Mono font, CSS variables, inline styles |
| Charts        | Recharts                                      |
| Backend       | Node.js + Express + TypeScript                |
| Database      | MySQL 8.0                                     |
| AI            | Llama 3.3 70B via Groq API                    |
| Auth          | JWT + bcrypt                                  |
| GitHub        | Octokit + OAuth + Webhooks + Checks API       |
| Connection    | mysql2 connection pool (min 5, max 20)        |

---

## Project Structure

```
codex/
├── README.md
├── PROJECT_SPEC.md              ← PRD + TRD + Schema + Architecture
├── codex_migration.sql          ← Latest DB migration (run this)
├── database/
│   ├── schema.sql               ← All 15+ tables, indexes
│   ├── procedures.sql           ← 5 stored procedures
│   └── triggers_views_events.sql← Triggers, views, event scheduler
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts            ← Express entry point + all routes
│       ├── db/connection.ts     ← mysql2 pool
│       ├── middleware/auth.ts   ← JWT middleware
│       ├── services/
│       │   ├── aiService.ts     ← Groq/Llama AI review + codebase analysis
│       │   └── githubService.ts ← GitHub file tree + smart sampling
│       ├── types/index.ts
│       └── controllers/
│           ├── authController.ts
│           ├── playgroundController.ts
│           ├── developerController.ts
│           ├── teamController.ts
│           ├── repoController.ts
│           ├── reviewController.ts
│           └── webhookController.ts ← PR webhook + Check Runs
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx
        ├── index.css            ← Design tokens + global styles
        ├── main.tsx
        ├── lib/api.ts           ← Typed API client
        ├── types/index.ts
        ├── hooks/useAuth.tsx
        ├── components/
        │   ├── Navbar.tsx
        │   ├── AnimatedEntry.tsx
        │   ├── ScoreRing.tsx
        │   └── ReviewCard.tsx
        └── pages/
            ├── Landing.tsx
            ├── Playground.tsx
            ├── PRs.tsx          ← PR list with grades + status
            ├── PRDetail.tsx     ← Diff viewer + AI review overlay
            ├── Repos.tsx        ← GitHub repo browser + analysis
            ├── History.tsx      ← Review history with filters
            ├── Dashboard.tsx
            ├── Leaderboard.tsx
            ├── AuthPage.tsx
            └── GitHubCallback.tsx
```

---

## Database Architecture

This is the core of the project. MySQL does the heavy lifting.

### Tables (15+)

| Table                  | Purpose                                              |
|------------------------|------------------------------------------------------|
| `users`                | Auth, GitHub OAuth, score, streak, badge, goal       |
| `teams`                | Organization unit                                    |
| `team_members`         | Many-to-many with role                               |
| `repositories`         | GitHub repo metadata, health score, webhook config   |
| `custom_rules`         | Plain-English AI rules per repo                      |
| `pull_requests`        | PR metadata from GitHub webhooks                     |
| `pr_file_diffs`        | Per-file diffs for the diff viewer                   |
| `pr_files`             | Files changed in each PR                             |
| `reviews`              | AI review results per PR or playground submission    |
| `review_comments`      | Individual findings (full-text indexed)              |
| `issue_taxonomy`       | Normalized category lookup (bug, security, etc.)     |
| `comment_categories`   | Junction: comment ↔ taxonomy                         |
| `developer_snapshots`  | Weekly materialized aggregates per developer         |
| `score_history`        | Point-in-time score log for sparklines               |
| `alert_configs`        | Threshold rules per team                             |
| `alert_logs`           | Fired alert records                                  |
| `repo_analyses`        | Codebase health analysis results                     |
| `review_shares`        | Shareable URLs for playground reviews (UUID slug)    |
| `team_invites`         | Email-based team invite tokens                       |
| `github_check_runs`    | GitHub Check Run IDs for PR status updates           |
| `webhook_events`       | Raw webhook event log for debugging                  |

### Stored Procedures (5)

| Procedure                     | What it does                                                      |
|-------------------------------|-------------------------------------------------------------------|
| `calculate_developer_score`   | Weighted composite score (correctness 30%, security 25%, etc.)   |
| `generate_weekly_snapshot`    | Aggregates all devs for the week — cursor loop + window UPDATE   |
| `flag_repeat_offender`        | Detects 3+ same issue in 30 days, updates badge + fires alert    |
| `get_team_analytics`          | CTE-heavy report: RANK(), LAG(), rolling AVG() in one query      |
| `search_reviews`              | Full-text MATCH...AGAINST search across all review comments      |

### Triggers (3)

| Trigger                            | Event                  | Action                                                  |
|------------------------------------|------------------------|---------------------------------------------------------|
| `trg_after_review_insert`          | AFTER INSERT on reviews| Updates developer score, repo avg, inserts score_history|
| `trg_after_pr_state_update`        | AFTER UPDATE on pull_requests | Fires alert if bad code merged, updates badge   |
| `trg_after_comment_category_insert`| AFTER INSERT on comment_categories | Calls flag_repeat_offender if threshold hit|

### Views (4)

| View                      | Uses                                                      |
|---------------------------|-----------------------------------------------------------|
| `v_developer_leaderboard` | RANK() OVER (PARTITION BY team), LAG() for delta          |
| `v_repo_health_summary`   | Aggregated repo metrics with NULLIF                       |
| `v_developer_trend`       | AVG OVER with ROWS BETWEEN 3 PRECEDING (rolling 4-wk avg)|
| `v_team_weekly_report`    | CROSS JOIN with CTE for team-wide weekly aggregate        |

### Event Scheduler (3)

| Event                          | Schedule          | Action                               |
|--------------------------------|-------------------|--------------------------------------|
| `evt_weekly_snapshot`          | Sunday 23:59      | Calls `generate_weekly_snapshot()`   |
| `evt_hourly_alert_check`       | Every hour        | Detects score drops > 2 pts          |
| `evt_daily_playground_cleanup` | Daily 03:00       | Deletes expired playground reviews   |

---

## Setup Guide

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- A Groq API key (free at https://console.groq.com)
- Optionally: a GitHub OAuth App

### Step 1 — MySQL Setup

```bash
sudo mysql -u root -p
```

Inside MySQL shell, run the files in order:

```sql
SOURCE /path/to/codex/database/schema.sql;
SOURCE /path/to/codex/database/procedures.sql;
SOURCE /path/to/codex/database/triggers_views_events.sql;
SOURCE /path/to/codex/codex_migration.sql;
```

Enable the event scheduler:

```sql
SET GLOBAL event_scheduler = ON;
```

Insert a default team and guest user (required for playground):

```sql
USE codex_db;

INSERT INTO users (id, name, email, password_hash, current_score, total_reviews, badge, role)
VALUES (1, 'Guest', 'guest@codex.local', 'not_used', 0.00, 0, 'newcomer', 'developer')
ON DUPLICATE KEY UPDATE name = 'Guest';

INSERT INTO teams (id, name, slug, owner_id)
VALUES (1, 'Default Team', 'default-team', 1)
ON DUPLICATE KEY UPDATE name = 'Default Team';

INSERT INTO team_members (team_id, user_id, role)
VALUES (1, 1, 'admin')
ON DUPLICATE KEY UPDATE role = 'admin';
```

Verify everything loaded:

```sql
USE codex_db;
SHOW TABLES;                                       -- 20+ tables
SHOW PROCEDURE STATUS WHERE Db = 'codex_db';       -- 5 procedures
SHOW TRIGGERS;                                     -- 3 triggers
SHOW EVENTS FROM codex_db;                         -- 3 events
```

### Step 2 — Backend

```bash
cd codex/backend
cp .env.example .env
```

Edit `.env`:

```env
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_NAME=codex_db
DB_USER=root
DB_PASSWORD=your_mysql_password

JWT_SECRET=any_random_string_minimum_32_characters

GROQ_API_KEY=gsk_...

GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_WEBHOOK_SECRET=any_random_string

FRONTEND_URL=http://localhost:5173
WEBHOOK_PUBLIC_URL=https://your-ngrok-url.ngrok.io
```

Get your Groq API key at: https://console.groq.com → API Keys

```bash
npm install
npm run dev
```

You should see:
```
✅ MySQL connected successfully
🚀 Codex API running on http://localhost:3001
```

### Step 3 — Frontend

Open a second terminal:

```bash
cd codex/frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## GitHub OAuth Setup

1. Go to https://github.com/settings/developers → OAuth Apps → New OAuth App
2. Fill in:
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:3001/api/auth/github/callback`
3. Copy the Client ID and Client Secret into backend `.env`

---

## GitHub Webhook Setup (for PR Reviews)

For PRs to appear automatically in Codex, GitHub needs a public URL to
send webhook events to. Locally, use ngrok:

```bash
npx ngrok http 3001
```

Copy the `https://xxxx.ngrok.io` URL and set it in backend `.env`:

```env
WEBHOOK_PUBLIC_URL=https://xxxx.ngrok.io
```

Restart the backend. Then in Codex:

1. Go to `/repos`
2. Find a connected repository
3. The webhook is installed automatically when you analyze a repo,
   or you can call `POST /api/webhooks/install` with `{ repoId: N }`

Now when anyone opens a PR on that repo:
- It appears instantly in `/prs`
- AI reviews it automatically within 15 seconds
- A grade comment is posted to the GitHub PR
- A GitHub Check Run shows pass/fail on the PR page

---

## Features

### Playground
- Paste any code, select language (or auto-detect on blur)
- Instant AI review with grade A–F, risk level, metrics strip
- 4 tabs: Overview, Issues, Fixes (before/after), Details
- Expandable critical issues with exact fix code
- Copy fix button on every suggestion
- Share review link (generates short UUID URL stored in MySQL)
- Re-run button to compare score before/after your changes
- No account required

### Pull Request Reviews
- Connect GitHub repos and install a webhook in one click
- Every PR opened on GitHub auto-triggers an AI review
- `/prs` page shows all PRs across all repos with grade badges
- Click any PR to see the full split diff viewer
- AI findings annotated per file and per line
- Grade + all 5 dimension scores visible inline
- GitHub Check Run posted to the PR (pass/fail native status)
- AI summary comment posted directly on the GitHub PR
- Manual re-review button if you push new commits

### Repository Analysis
- Public URL input — analyze any public GitHub repo without login
- Smart file sampling: up to 40 files, intelligently ranked by importance
- Overcomes GitHub tree truncation with recursive directory walking
- 8 dimension scores out of 100 (structure, code quality, security, etc.)
- Plain-English summary of what the repo does and who it's for
- Auto-extracted "How to Run Locally" commands from README/package.json
- Key folders explained in plain English
- Architecture breakdown by layer (Frontend/Backend/Services/etc.)
- Recommendations typed as Issues, Automations, or Refactors
  with effort level, impact level, and time estimate
- Security findings with per-severity color coding
- Language distribution with percentage bars
- File tree browser with search and file type filter pills
- Per-file AI insights with quality notes and specific issues

### Developer Dashboard
- Score ring with animated SVG, grade badge, streak indicator
- Real score breakdown from actual review data (5 dimensions)
- 8-week trend area chart with 4-week rolling average overlay
- Team rank, weekly reviews, bug count, score delta stats
- Score goal setting with deadline and progress bar
- Top 5 issue categories from last 90 days (MySQL query)
- Recent reviews row with clickable grades
- Team leaderboard preview

### Team Leaderboard
- RANK() window function partitioned by team
- LAG() for week-over-week rank delta
- Medal display for top 3
- Badge system: Newcomer, Consistent, Improving, Declining, Watch List
- All real-time from `v_developer_leaderboard` MySQL view

### Review History
- Every review ever submitted in a sortable table
- Filter by language, score range, date
- Click any row to view the full review
- Grade badges with color coding

### Score Analytics
- Developer snapshots generated every Sunday by MySQL Event Scheduler
- 4-week rolling average computed by window function in MySQL view
- Pattern offender detection via trigger + stored procedure
- Streak tracking: increments daily on any review submission
- Badge auto-updated by trigger after PR merge based on 4-week trend

---

## API Reference

### Public (no auth)
```
POST /api/auth/register           { name, email, password }
POST /api/auth/login              { email, password }
GET  /api/auth/github             → GitHub OAuth redirect
GET  /api/auth/github/callback    → JWT token redirect
POST /api/playground/review       { code, language, rules? }
POST /api/github/analyze-public   { url }
GET  /api/reviews/share/:slug     → Shared review
POST /api/reviews/detect-language { code }
POST /api/webhooks/github         → GitHub webhook events
GET  /health
```

### Protected (Bearer token required)
```
GET  /api/auth/me

GET  /api/prs                     ?state=open|merged&repoId=N&limit=N
GET  /api/prs/:id                 → PR + files + review
POST /api/prs/review              { prId }
POST /api/webhooks/install        { repoId }

GET  /api/github/repos
GET  /api/github/repos/:owner/:repo/analyze
GET  /api/github/repos/:repoId/history
GET  /api/github/repos/:repoId/health

GET  /api/reviews/history
GET  /api/reviews/:id
POST /api/reviews/share           { reviewId }

GET  /api/developers/:id
GET  /api/developers/:id/analytics
GET  /api/developers/:id/snapshots

POST /api/teams                   { name }
GET  /api/teams/:id/leaderboard
GET  /api/teams/:id/analytics     ?start=YYYY-MM-DD&end=YYYY-MM-DD
GET  /api/teams/:id/report
GET  /api/teams/:id/digest
GET  /api/teams/:id/alerts

PUT  /api/users/goal              { score_goal, score_goal_deadline }
```

---

## Design System

The entire frontend uses a single consistent design system:

| Token              | Value     | Usage                              |
|--------------------|-----------|------------------------------------|
| `--bg`             | `#0c0c0c` | Page background                    |
| `--bg-1`           | `#111111` | Card background                    |
| `--bg-2`           | `#161616` | Input background                   |
| `--bg-3`           | `#1c1c1c` | Subtle surface                     |
| `--border`         | `#222222` | Default borders                    |
| `--border-2`       | `#2e2e2e` | Hover borders                      |
| `--text-1`         | `#e8e4d4` | Primary text (warm cream)          |
| `--text-2`         | `#9a9488` | Secondary text                     |
| `--text-3`         | `#5a5650` | Muted labels                       |
| `--red`            | `#c41e1e` | Primary accent (all CTAs)          |
| Font               | Geist Mono| Monospace throughout               |
| Corners            | `0px`     | No rounded corners anywhere        |
| Grid overlay       | Fixed     | Subtle grid pattern on background  |

---

## Demo Script (for presentation)

1. **Open MySQL Workbench** — show the ER diagram (Database → Reverse Engineer → `codex_db`)

2. **Show the playground** at `/playground` — paste this code and hit Review:
```javascript
function loginUser(req, res) {
  const query = "SELECT * FROM users WHERE username = '" + req.body.username + "'";
  db.execute(query, (err, results) => {
    if (err) console.log(err);
    else res.send("Welcome " + results[0].name);
  });
}
```

3. **Show MySQL trigger fired** — in Workbench run:
```sql
USE codex_db;
SELECT * FROM score_history ORDER BY id DESC LIMIT 3;
SELECT * FROM reviews ORDER BY id DESC LIMIT 1;
```

4. **Show the leaderboard** at `/leaderboard` — live RANK() window function

5. **Show stored procedure** — in Workbench:
```sql
CALL get_team_analytics(1, '2025-01-01', CURDATE());
```

6. **Show the views** — in Workbench:
```sql
SELECT * FROM v_developer_leaderboard;
SELECT * FROM v_developer_trend WHERE developer_id = 1;
SELECT * FROM v_team_weekly_report;
```

7. **Show the event scheduler**:
```sql
SHOW EVENTS FROM codex_db;
CALL generate_weekly_snapshot();
SELECT * FROM developer_snapshots ORDER BY created_at DESC LIMIT 5;
```

8. **Show repo analysis** at `/repos` — analyze any public repo, show
   the 8 dimension scores, architecture breakdown, file tree

9. **Show PR review** at `/prs` — if webhook is installed, open a PR
   on GitHub and show it appear automatically with a grade badge

---

## Common Issues

**MySQL access denied**
```bash
sudo mysql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'yourpassword';
FLUSH PRIVILEGES;
EXIT;
```

**Event scheduler not running**
```sql
SET GLOBAL event_scheduler = ON;
SHOW VARIABLES LIKE 'event_scheduler'; -- should be ON
```

**Webhook not receiving events locally**
```bash
npx ngrok http 3001
# Copy the https URL → set WEBHOOK_PUBLIC_URL in backend/.env → restart backend
```

**Groq API errors**
- Key must start with `gsk_`
- Get a free key at https://console.groq.com

**GitHub repo analysis fails**
- Private repos require GitHub OAuth login
- Public repos work with the URL bar on `/repos` without login

**8-week chart is empty**
```sql
CALL generate_weekly_snapshot();
```

**Foreign key error on repo analyze**
```sql
USE codex_db;
INSERT INTO teams (id, name, slug, owner_id) VALUES (1, 'Default Team', 'default-team', 1) ON DUPLICATE KEY UPDATE name = 'Default Team';
```

---

## Environment Variables

### Backend `.env`

```env
PORT=3001
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_NAME=codex_db
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_POOL_MIN=5
DB_POOL_MAX=20

JWT_SECRET=minimum_32_character_random_string
JWT_EXPIRES_IN=24h

GROQ_API_KEY=gsk_...

GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_WEBHOOK_SECRET=any_random_string

FRONTEND_URL=http://localhost:5173
WEBHOOK_PUBLIC_URL=https://your-ngrok-url.ngrok.io
```

### Frontend `.env`

```env
VITE_API_URL=http://localhost:3001/api
```

---

*Built as a DBMS Mini Project · MySQL 8.0 · Llama 3.3 70B · React + TypeScript*
