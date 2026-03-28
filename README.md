# Codex — AI Code Review Platform

> **DBMS Mini Project** · MySQL + AI + React + TypeScript SaaS  
> The database isn't just storage — it's the intelligence engine.

---

## What is Codex?

Codex is a full-stack AI-powered code review SaaS that automatically reviews pull requests, scores developer code quality over time, and surfaces team-wide insights. Every meaningful operation — scoring, ranking, alerting, pattern detection, weekly reporting — runs **inside MySQL**, not in application code.

---

## Project Structure

```
codex/
├── PROJECT_SPEC.md              ← PRD + TRD + Schema + Architecture
├── README.md                    ← You are here
├── database/
│   ├── schema.sql               ← 15 tables, all indexes
│   ├── procedures.sql           ← 4 stored procedures
│   └── triggers_views_events.sql← 3 triggers + 4 views + 3 events
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts            ← Express entry point
│       ├── db/connection.ts     ← mysql2 connection pool
│       ├── middleware/auth.ts   ← JWT middleware
│       ├── services/aiService.ts← Anthropic Claude integration
│       ├── types/index.ts       ← Shared TS types
│       └── controllers/
│           ├── authController.ts
│           ├── playgroundController.ts
│           ├── developerController.ts
│           └── teamController.ts
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx              ← Router + auth wrapper
        ├── index.css            ← Global styles + OLED theme
        ├── main.tsx             ← React entry point
        ├── lib/api.ts           ← Typed API client
        ├── types/index.ts       ← Shared TS interfaces
        ├── hooks/useAuth.tsx    ← Auth context + hook
        ├── components/
        │   ├── Navbar.tsx       ← Floating glass pill nav
        │   ├── AnimatedEntry.tsx← IntersectionObserver scroll reveal
        │   ├── ScoreRing.tsx    ← Animated SVG score circle
        │   └── ReviewCard.tsx   ← Double-bezel finding card
        └── pages/
            ├── Landing.tsx      ← Editorial Split + Bento hero
            ├── Playground.tsx   ← Instant code review (no auth)
            ├── Dashboard.tsx    ← Bento analytics dashboard
            ├── Leaderboard.tsx  ← Team ranking with RANK() window fn
            └── AuthPage.tsx     ← Login + Register
```

---

## Prerequisites

| Tool        | Version   | Install |
|-------------|-----------|---------|
| Node.js     | 18+       | https://nodejs.org |
| MySQL       | 8.0+      | https://dev.mysql.com/downloads |
| npm / yarn  | latest    | bundled with Node |

You also need:
- An **Anthropic API key** (get one at https://console.anthropic.com)
- Optionally a **GitHub OAuth App** for repository integration

---

## Setup Guide

### Step 1 — Clone and navigate

```bash
git clone <your-repo-url>
cd codex
```

---

### Step 2 — Set up the MySQL Database

Open MySQL Workbench or your terminal MySQL client and run the files **in this exact order**:

```bash
# Connect to MySQL
mysql -u root -p

# Create the database and run all SQL files
mysql -u root -p < database/schema.sql
mysql -u root -p < database/procedures.sql
mysql -u root -p < database/triggers_views_events.sql
```

Or from inside the MySQL shell:

```sql
SOURCE /full/path/to/codex/database/schema.sql;
SOURCE /full/path/to/codex/database/procedures.sql;
SOURCE /full/path/to/codex/database/triggers_views_events.sql;
```

**Enable the Event Scheduler** (needed for weekly snapshots and cleanup):

```sql
SET GLOBAL event_scheduler = ON;
```

**Verify the setup** — run these to confirm everything loaded:

```sql
USE codex_db;
SHOW TABLES;            -- Should show 15 tables
SHOW PROCEDURE STATUS WHERE Db = 'codex_db';   -- 4 procedures
SHOW TRIGGERS;          -- 3 triggers
SHOW EVENTS;            -- 3 events
SELECT table_name, VIEW_DEFINITION IS NOT NULL as is_view
  FROM information_schema.VIEWS
 WHERE TABLE_SCHEMA = 'codex_db';  -- 4 views
```

---

### Step 3 — Configure the Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your values:

```env
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_NAME=codex_db
DB_USER=root
DB_PASSWORD=your_mysql_password

JWT_SECRET=any_random_string_at_least_32_chars_long

ANTHROPIC_API_KEY=sk-ant-api03-...

GITHUB_CLIENT_ID=     # optional
GITHUB_CLIENT_SECRET= # optional
GITHUB_WEBHOOK_SECRET=# optional

FRONTEND_URL=http://localhost:5173
```

---

### Step 4 — Install Backend Dependencies

```bash
cd backend
npm install
```

---

### Step 5 — Start the Backend

```bash
npm run dev
```

You should see:
```
✅ MySQL connected successfully
🚀 Codex API running on http://localhost:3001
```

Test it:
```bash
curl http://localhost:3001/health
# → {"status":"ok","timestamp":"..."}
```

---

### Step 6 — Configure and Start the Frontend

```bash
cd ../frontend
npm install
```

Create a `.env` file:
```env
VITE_API_URL=http://localhost:3001/api
```

Start the dev server:
```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Using the App

### Playground (No account needed)

1. Go to **http://localhost:5173/playground**
2. Paste any code in the editor
3. Select the language from the dropdown
4. Click **Review code**
5. Watch the AI review appear with scores, findings, and suggestions

This is the best way to demo it live — no setup, instant results.

---

### Full Account Flow

1. **Register** at `/register`
2. You'll be taken to the **Dashboard** at `/dashboard`
3. Use the **Playground** to generate reviews (they're tracked to your account)
4. Check the **Leaderboard** at `/leaderboard` to see team rankings

---

## MySQL Features Used — Quick Reference

This is the core of the project. Here's where to find each MySQL feature:

### Normalized Schema (15 Tables)
**File:** `database/schema.sql`  
15 fully normalized tables including `users`, `teams`, `team_members`, `repositories`, `custom_rules`, `pull_requests`, `pr_files`, `reviews`, `review_comments`, `issue_taxonomy`, `comment_categories`, `developer_snapshots`, `score_history`, `alert_configs`, `alert_logs`

### Stored Procedures (4)
**File:** `database/procedures.sql`

| Procedure | What it does |
|-----------|-------------|
| `calculate_developer_score` | Computes weighted composite score (correctness 30%, security 25%, readability 20%, performance 15%, maintainability 10%) |
| `generate_weekly_snapshot` | Aggregates all developers for the week. Uses a cursor loop + UPSERT + window function UPDATE |
| `flag_repeat_offender` | Detects if a developer has the same issue category 3+ times in 30 days. Updates badge + fires alert |
| `get_team_analytics` | Multi-CTE team report with window functions (RANK, LAG, rolling AVG) — called by the API |

Run one manually:
```sql
CALL calculate_developer_score(1, CURDATE(), @score, @count);
SELECT @score, @count;
```

### Triggers (3)
**File:** `database/triggers_views_events.sql`

| Trigger | Event | Action |
|---------|-------|--------|
| `trg_after_review_insert` | After INSERT on `reviews` | Auto-updates developer's `current_score` and `total_reviews`, updates repo `avg_score`, appends to `score_history` |
| `trg_after_pr_state_update` | After UPDATE on `pull_requests` | If merged with score < 5.0, inserts an alert. Updates developer badge based on 4-week trend |
| `trg_after_comment_category_insert` | After INSERT on `comment_categories` | Checks count for that category, calls `flag_repeat_offender` if ≥ 3 |

### Views (4)
**File:** `database/triggers_views_events.sql`

| View | Uses |
|------|------|
| `v_developer_leaderboard` | RANK() OVER (PARTITION BY team), LAG() for delta |
| `v_repo_health_summary` | Aggregated repo health metrics with NULLIF |
| `v_developer_trend` | AVG OVER with ROWS BETWEEN 3 PRECEDING AND CURRENT ROW (rolling 4-week avg) |
| `v_team_weekly_report` | CROSS JOIN with CTE for current week, team-wide aggregate |

Query one directly:
```sql
SELECT * FROM v_developer_leaderboard WHERE team_id = 1;
```

### Window Functions
Used in views and `get_team_analytics`:
```sql
RANK() OVER (PARTITION BY team_id ORDER BY current_score DESC)
LAG(avg_score) OVER (PARTITION BY developer_id ORDER BY week_start)
AVG(score_overall) OVER (PARTITION BY developer_id ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)
```

### MySQL Event Scheduler (3 Events)

| Event | Schedule | Action |
|-------|----------|--------|
| `evt_weekly_snapshot` | Every Sunday 23:59 | Calls `generate_weekly_snapshot()` |
| `evt_hourly_alert_check` | Every hour | Detects score drops > 2 points, inserts alerts |
| `evt_daily_playground_cleanup` | Every day 03:00 | Deletes expired playground reviews |

### Full-Text Search
```sql
-- Index on review_comments.content
ALTER TABLE review_comments ADD FULLTEXT idx_ft_content (content);

-- Search across all reviews
CALL search_reviews(1, 'null pointer sql injection');
```

### CTE (Common Table Expressions)
Used in `get_team_analytics` and `v_team_weekly_report`:
```sql
WITH base_reviews AS (...),
     dev_aggregates AS (...),
     ranked AS (... RANK() OVER ...)
SELECT ... FROM ranked JOIN users ...
```

---

## API Reference

### Public Endpoints

```
POST /api/auth/register    { name, email, password }
POST /api/auth/login       { email, password }
POST /api/playground/review { code, language, rules? }
GET  /health
```

### Protected Endpoints (require Bearer token)

```
GET  /api/auth/me
GET  /api/developers/:id
GET  /api/developers/:id/analytics
GET  /api/developers/:id/snapshots
POST /api/teams                      { name }
GET  /api/teams/:id/leaderboard
GET  /api/teams/:id/analytics        ?start=YYYY-MM-DD&end=YYYY-MM-DD
GET  /api/teams/:id/report
GET  /api/teams/:id/digest
GET  /api/teams/:id/alerts
```

---

## Demo Script (for presentation)

1. **Open MySQL Workbench** — show the ER diagram (`schema.sql`)
2. **Show the playground** at `/playground` — paste this code:

```javascript
function getUser(id) {
  const query = "SELECT * FROM users WHERE id = " + id;
  return db.query(query);
}
```

3. **Hit Review** — show the AI catching the SQL injection in real time
4. **Open MySQL Workbench** — show the trigger fired:
   ```sql
   SELECT * FROM score_history ORDER BY id DESC LIMIT 3;
   ```
5. **Show the leaderboard** at `/leaderboard` — live RANK() window function
6. **Run the stored procedure** manually:
   ```sql
   CALL get_team_analytics(1, '2025-01-01', CURDATE());
   ```
7. **Show the view**:
   ```sql
   SELECT * FROM v_developer_trend WHERE developer_id = 1;
   ```
8. **Show the event scheduler** is active:
   ```sql
   SHOW EVENTS FROM codex_db;
   SELECT * FROM information_schema.EVENTS WHERE EVENT_SCHEMA = 'codex_db';
   ```

---

## Design System

The frontend uses a custom **Ethereal Glass** design system:

- **Background:** OLED black `#050505` with fixed radial mesh gradients (purple + emerald)
- **Cards:** Double-Bezel architecture — outer shell `bg-white/5 border-white/10` wrapping inner glass `bg-white/[0.03]` with inset highlight
- **Typography:** Plus Jakarta Sans — loaded from Google Fonts
- **Motion:** Framer Motion + custom `cubic-bezier(0.32, 0.72, 0, 1)` spring on all transitions
- **Layout:** Asymmetrical Bento grid on Dashboard, Editorial Split on Landing
- **Navigation:** Floating glass pill, detached from top — hamburger morphs to × on mobile

---

## Build for Production

```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
# Output in frontend/dist — serve with nginx or Vercel
```

---

## Common Issues

**MySQL connection refused**
- Make sure MySQL service is running: `sudo systemctl start mysql`
- Verify `.env` credentials match your MySQL user

**Event scheduler not running**
```sql
SET GLOBAL event_scheduler = ON;
SHOW VARIABLES LIKE 'event_scheduler'; -- should be ON
```

**Anthropic API 401 error**
- Double-check `ANTHROPIC_API_KEY` in `.env`
- Key should start with `sk-ant-`

**CORS error in browser**
- Confirm `FRONTEND_URL` in backend `.env` matches your frontend port exactly
- Default: `http://localhost:5173`

**Trigger not firing**
- Triggers require the `TRIGGER` privilege: `GRANT TRIGGER ON codex_db.* TO 'your_user'@'localhost';`

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + custom CSS animations |
| Charts | Recharts |
| Backend | Node.js + Express + TypeScript |
| Database | MySQL 8.0 (5NF schema, procedures, triggers, views, events, FTS, CTEs, window functions) |
| AI | Anthropic Claude (claude-sonnet-4-20250514) |
| Auth | JWT + bcrypt |
| Connection Pool | mysql2 (min 5, max 20 connections) |

---

*Built for DBMS Mini Project · MySQL is the star of the show*
