# Codex — AI Code Review Platform

> **DBMS Mini Project** · MySQL + Groq AI + React + TypeScript  
> The database isn't just storage — it's the automated intelligence engine.

---

## 📽️ What is Codex?

Codex is a full-stack AI-powered code review SaaS designed to automate the developer workflow. It monitors GitHub Pull Requests in real-time, performs deep static analysis using LLMs, and surfaces actionable insights directly in your development pipeline.

**The "DBMS Mini Project" Difference:** Every meaningful metric — scoring, ranking, alerting, and automated reporting — is computed directly inside **MySQL 8.0** using advanced triggers, views, and stored procedures.

---

## 🚀 Key Features

*   **Automated PR Reviews**: Native GitHub integration via webhooks. Codex automatically analyzes every diff and posts reviews as PR comments.
*   **PR Management Dashboard**: A dedicated UI to track pull requests across all your repositories with side-by-side diff viewers.
*   **AI Code Quality Scoring**: Instant feedback on correctness, security, readability, and performance powered by **Groq (Llama-3.3-70b)**.
*   **Team Leaderboard**: Real-time developer ranking using MySQL `RANK()` and `LAG()` window functions to track improvement trends.
*   **Custom Review Rules**: Define repository-specific rules (e.g., "Enforce clean architecture") that the AI strictly enforces.
*   **Smart Alerts**: Automatic detection of "Repeat Offenders" and critical security regressions via MySQL Event Scheduler.

---

## 🛠️ Project Structure

```
codex/
├── database/
│   ├── schema.sql               ← 15 tables, 5NF normalized
│   ├── procedures.sql           ← Scoring & Analytics logic
│   ├── triggers_views_events.sql← Automation & Real-time trends
│   └── codex_migration.sql      ← Latest PR Workflow updates
├── backend/
│   └── src/
│       ├── controllers/
│       │   ├── webhookController.ts ← GitHub Webhook logic
│       │   └── repoController.ts    ← Repo analysis & management
│       ├── services/
│       │   ├── aiService.ts         ← Groq AI Integration (Token-Optimized)
│       │   └── githubService.ts     ← File sampling & Octokit logic
│       └── server.ts                ← Express entry point
└── frontend/
    └── src/
        ├── pages/
        │   ├── PRs.tsx              ← Pull Request Dashboard
        │   ├── PRDetail.tsx        ← Side-by-side Diff Viewer
        │   ├── Repos.tsx            ← Webhook Installer UI
        │   └── Playground.tsx       ← Instant AI Review
        └── components/
            └── Navbar.tsx           ← Navigation & Theme toggle
```

---

## 🏗️ Setup & Installation

### 1. Database Setup (MySQL 8.0+)
Run the scripts in the `database/` folder in the following order:
1. `schema.sql`
2. `procedures.sql`
3. `triggers_views_events.sql`
4. `pdm_migration.sql` (to enable PR features)

```sql
SET GLOBAL event_scheduler = ON;
```

### 2. Backend Configuration
Create a `backend/.env` file:
```env
PORT=3001
DB_HOST=localhost
DB_NAME=codex_db
DB_USER=root
DB_PASSWORD=your_password

GROQ_API_KEY=gsk_...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
WEBHOOK_PUBLIC_URL=https://your-tunnel-url.loca.lt
```

### 3. Start Development
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## 🧪 Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + TypeScript |
| **Backend** | Node.js + Express |
| **Database** | MySQL 8.0 (Views, Triggers, Procs, Events, CTEs) |
| **AI Engine** | Groq (Llama-3.3-7b-versatile / 70b) |
| **Integrations** | GitHub Octokit + GitHub Webhooks |

---


