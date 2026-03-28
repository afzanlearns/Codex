# Codex — AI Code Review Platform
### Project Specification Document (PRD + TRD + Schema + Architecture)

---

## Table of Contents
1. [Product Requirements Document (PRD)](#prd)
2. [Technical Requirements Document (TRD)](#trd)
3. [Database Schema & Design](#schema)
4. [System Architecture](#architecture)
5. [API Reference](#api)
6. [Frontend Design Architecture](#frontend-design)

---

## 1. Product Requirements Document (PRD) {#prd}

### 1.1 Overview
**Codex** is an AI-powered code review SaaS platform that automatically reviews pull requests, scores developer code quality over time, and surfaces actionable team-wide insights. MySQL is the core intelligence engine — not just storage.

### 1.2 Problem Statement
Code reviews are slow, inconsistent, and leave no historical data trail. Teams have no visibility into whether code quality is improving, who introduces the most bugs, or what patterns repeat across engineers. Codex solves this with automated AI reviews stored in a deeply normalized MySQL database that enables longitudinal analytics.

### 1.3 Target Users
- **Individual Developers** — want instant feedback on code without waiting for peers
- **Team Leads** — want visibility into team code quality trends
- **Engineering Managers** — want developer performance data over time

### 1.4 Core Features

#### F1: Playground Mode (No Auth Required)
- Paste any code snippet, select language
- Receive instant AI review with score, issues, suggestions
- No GitHub connection needed — great for demos

#### F2: Repository Integration
- Connect GitHub repositories via OAuth
- Webhook listener auto-triggers review on every PR
- Store full PR metadata, file diffs, commit history

#### F3: AI Review Engine
- LLM-powered review via Anthropic Claude API
- Scores each review on: correctness, readability, security, performance, maintainability
- Classifies issues by taxonomy (bug, smell, vulnerability, style, docs)
- Respects per-repo custom rules defined by team leads

#### F4: Developer Analytics
- Individual score dashboard with week-over-week trend
- Most repeated mistake categories
- Files with highest bug density
- Rolling 4-week quality average (window functions)

#### F5: Team Leaderboard
- Real-time ranking of developers within a team
- Rank change vs last week (LAG window function)
- Badge system: `Consistent`, `Improving`, `Pattern Offender`

#### F6: Custom Rules Engine
- Team leads define plain-English rules per repo
- Rules are stored in MySQL and injected into AI prompt at review time
- Example: "Never use `var` in JavaScript", "All functions must have docstrings"

#### F7: Weekly Digest
- MySQL Event Scheduler triggers every Sunday midnight
- `generate_weekly_snapshot()` stored procedure runs
- AI generates a natural language team summary from snapshot data

### 1.5 Success Metrics
- Time to first review: < 5 seconds (Playground)
- Review accuracy (user rating): > 80% helpful
- Developer score trend: measurable improvement over 8 weeks

---

## 2. Technical Requirements Document (TRD) {#trd}

### 2.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + Framer Motion |
| Backend | Node.js + Express + TypeScript |
| Database | MySQL 8.0+ |
| AI | Anthropic Claude API (claude-sonnet-4-20250514) |
| Auth | JWT + bcrypt |
| GitHub Integration | GitHub REST API + Webhooks |
| Code Highlighting | Shiki |

### 2.2 MySQL Feature Utilization Matrix

| Feature | Where Used | Purpose |
|---------|-----------|---------|
| Normalized Schema (5NF) | All tables | Data integrity, no redundancy |
| Stored Procedures | Score calc, snapshots | Business logic in the DB |
| Triggers | After INSERT on reviews | Auto-update developer scores |
| Views | Leaderboard, reports | Pre-built intelligence layers |
| Window Functions | RANK, LAG, AVG OVER | Rankings and trend detection |
| Events (Scheduler) | Weekly snapshots | Autonomous DB cron jobs |
| Full-Text Search | `review_comments` | Search across all reviews |
| CTEs | Analytics queries | Complex multi-step analysis |
| Recursive CTEs | Team hierarchy traversal | Nested team structures |
| Transactions | Review insert flow | Atomicity across 5+ tables |

### 2.3 Non-Functional Requirements
- API response time: < 200ms for database queries, < 10s for AI reviews
- Database: All foreign keys indexed, query explain plans reviewed
- Security: Parameterized queries only (no string interpolation), JWT expiry 24h
- Scalability: Connection pooling (mysql2 pool, min 5, max 20)

### 2.4 Environment Variables

**Backend `.env`:**
```
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_NAME=codex_db
DB_USER=root
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret_min_32_chars
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_WEBHOOK_SECRET=your_webhook_secret
FRONTEND_URL=http://localhost:5173
```

**Frontend `.env`:**
```
VITE_API_URL=http://localhost:3001/api
VITE_GITHUB_CLIENT_ID=your_github_client_id
```

---

## 3. Database Schema & Design {#schema}

### 3.1 Entity Relationship Overview

```
users ──< team_members >── teams
users ──< repositories (via team)
repositories ──< pull_requests ──< pr_files
pull_requests ──< reviews ──< review_comments ──< comment_categories
users ──< developer_snapshots (weekly)
repositories ──< custom_rules
teams ──< alert_configs ──< alert_logs
issue_taxonomy (lookup table)
```

### 3.2 Table Definitions (15 Tables)

#### Core Identity
- `users` — auth + profile
- `teams` — organization unit
- `team_members` — many-to-many with role

#### Repository Layer
- `repositories` — GitHub repo metadata
- `custom_rules` — per-repo AI rule injection

#### PR & Review Layer
- `pull_requests` — PR metadata from GitHub
- `pr_files` — individual files changed in a PR
- `reviews` — aggregate review per PR (score, summary)
- `review_comments` — individual findings (full-text indexed)
- `issue_taxonomy` — normalized category lookup

#### Analytics Layer
- `comment_categories` — junction: comment ↔ taxonomy
- `developer_snapshots` — weekly materialized aggregates
- `score_history` — point-in-time score log (for charting)

#### Alerting Layer
- `alert_configs` — threshold rules per team
- `alert_logs` — fired alert records

### 3.3 Key Indexes
```sql
-- Full-text on review content
ALTER TABLE review_comments ADD FULLTEXT ft_content (content);

-- Performance indexes
CREATE INDEX idx_reviews_dev_week ON reviews(developer_id, created_at);
CREATE INDEX idx_snapshots_dev_week ON developer_snapshots(developer_id, week_start);
CREATE INDEX idx_pr_repo ON pull_requests(repository_id, state, created_at);
```

### 3.4 Stored Procedures

| Procedure | Inputs | Purpose |
|-----------|--------|---------|
| `calculate_developer_score` | `dev_id`, `week_date` | Weighted score from all reviews in a week |
| `generate_weekly_snapshot` | none | Runs every Sunday — aggregates all devs |
| `flag_repeat_offender` | `dev_id` | Checks if same issue category appeared 3+ times in 30 days |
| `get_team_analytics` | `team_id`, `start`, `end` | CTE-based multi-metric team report |

### 3.5 Triggers

| Trigger | Event | Action |
|---------|-------|--------|
| `trg_after_review_insert` | AFTER INSERT on `reviews` | Update developer's rolling score in `users` |
| `trg_after_bad_review_merge` | AFTER UPDATE on `pull_requests` | If PR merged with score < 5, insert into `alert_logs` |
| `trg_pattern_offender_check` | AFTER INSERT on `comment_categories` | Call `flag_repeat_offender` if count threshold hit |

### 3.6 Views

| View | Purpose |
|------|---------|
| `v_developer_leaderboard` | RANK() with team partition, LAG for delta |
| `v_repo_health_summary` | Avg score, bug rate, open PRs per repo |
| `v_team_weekly_report` | All data needed for weekly digest email |
| `v_developer_trend` | 8-week rolling window per developer |

---

## 4. System Architecture {#architecture}

### 4.1 Request Flow — Playground Review
```
User pastes code → POST /api/playground/review
→ Express validates input
→ aiService.reviewCode() calls Anthropic API
→ Response parsed into structured ReviewResult
→ Stored in playground_reviews (ephemeral, 7-day TTL)
→ Structured response returned to frontend
→ ReviewCard renders with score + annotations
```

### 4.2 Request Flow — GitHub PR Review
```
GitHub PR opened → Webhook POST /api/webhooks/github
→ Signature verified (HMAC-SHA256)
→ PR metadata stored in pull_requests
→ Files stored in pr_files
→ aiService.reviewPR() called per file batch
→ Reviews + comments inserted (transaction)
→ Triggers fire: score updated, alerts checked
→ GitHub Checks API updated with review summary
```

### 4.3 Analytics Flow
```
GET /api/developers/:id/analytics
→ Query v_developer_trend (view, windowed)
→ Query developer_snapshots (last 8 weeks)
→ Call get_team_analytics stored procedure
→ All aggregated in MySQL, not in app code
→ Returned as structured JSON for chart rendering
```

### 4.4 Directory Structure
```
codex/
├── PROJECT_SPEC.md          ← This file
├── README.md
├── database/
│   ├── schema.sql           ← All CREATE TABLE statements
│   ├── procedures.sql       ← Stored procedures
│   ├── triggers.sql         ← All triggers
│   ├── views.sql            ← All views
│   └── events.sql           ← MySQL Event Scheduler jobs
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── server.ts        ← Express app entry
│       ├── db/
│       │   └── connection.ts ← mysql2 pool setup
│       ├── routes/          ← Route definitions
│       ├── controllers/     ← Request handlers
│       ├── services/        ← Business logic (AI, GitHub)
│       ├── middleware/      ← Auth, error handling
│       └── types/           ← Shared TypeScript types
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx          ← Router + layout
        ├── pages/           ← Full page components
        ├── components/      ← Reusable UI components
        ├── lib/             ← API client, utilities
        ├── hooks/           ← Custom React hooks
        └── types/           ← TypeScript interfaces
```

---

## 5. API Reference {#api}

### Auth
```
POST   /api/auth/register        Body: { name, email, password }
POST   /api/auth/login           Body: { email, password }
GET    /api/auth/github          Redirect → GitHub OAuth
GET    /api/auth/github/callback Query: { code }
```

### Playground
```
POST   /api/playground/review    Body: { code, language, rules? }
```

### Repositories
```
GET    /api/repos                Query: { teamId }
POST   /api/repos                Body: { githubUrl, teamId }
GET    /api/repos/:id/health     → v_repo_health_summary
GET    /api/repos/:id/rules      → custom_rules
POST   /api/repos/:id/rules      Body: { rule, description }
DELETE /api/repos/:id/rules/:ruleId
```

### Reviews
```
GET    /api/reviews              Query: { repoId, devId, limit, offset }
GET    /api/reviews/:id          → review + comments
POST   /api/reviews/search       Body: { query } → Full-text search
```

### Developers
```
GET    /api/developers/:id       → profile + current score
GET    /api/developers/:id/analytics  → 8-week trend, top issues
GET    /api/developers/:id/snapshots  → weekly snapshots
```

### Teams
```
GET    /api/teams/:id/leaderboard  → v_developer_leaderboard
GET    /api/teams/:id/report       → v_team_weekly_report
POST   /api/teams                  Body: { name }
POST   /api/teams/:id/members      Body: { userId, role }
```

### Webhooks
```
POST   /api/webhooks/github      GitHub webhook endpoint
```

---

## 6. Frontend Design Architecture {#frontend-design}

### 6.1 Design System
- **Vibe:** Ethereal Glass (Ethereal SaaS/AI/Tech)
- **Background:** OLED black `#050505` with radial purple/emerald mesh gradients
- **Cards:** Double-Bezel (outer `bg-white/5 border-white/10` + inner glass `bg-white/[0.03]`)
- **Typography:** `Geist` for UI, `Plus Jakarta Sans` for headings
- **Motion:** Framer Motion, all custom cubic-beziers `(0.32, 0.72, 0, 1)`
- **Layout:** Asymmetrical Bento on Dashboard, Editorial Split on Landing

### 6.2 Page Inventory

| Page | Route | Layout |
|------|-------|--------|
| Landing | `/` | Editorial Split Hero + Bento features |
| Login/Register | `/login` | Centered glass card |
| Playground | `/playground` | Split: editor left, review right |
| Dashboard | `/dashboard` | Bento grid: score ring + charts + leaderboard |
| Repository Detail | `/repos/:id` | List of PRs + health metrics |
| Developer Profile | `/dev/:id` | Score trend + issue breakdown |
| Leaderboard | `/leaderboard` | Full team ranking table |

### 6.3 Component Hierarchy
```
App
├── Navbar (floating glass pill, hamburger morph)
├── pages/
│   ├── Landing (Hero + FeatureGrid + CTA)
│   ├── Playground (CodeEditor + ReviewPanel)
│   ├── Dashboard (ScoreRing + TrendChart + BentoGrid)
│   ├── Leaderboard (LeaderboardTable + RankBadge)
│   └── Login
└── components/
    ├── AnimatedEntry (IntersectionObserver wrapper)
    ├── ScoreRing (SVG animated circle)
    ├── ReviewCard (double-bezel issue card)
    ├── TrendChart (Recharts line chart)
    ├── RankBadge (developer ranking pill)
    └── GlassCard (reusable double-bezel wrapper)
```
