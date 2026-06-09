<div align="center">

# CODEX 2.0

### RAG-Powered Developer Intelligence Platform

*Every finding grounded. Every answer cited. Every recommendation evidenced.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql)](https://www.mysql.com/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-latest-FF6B35?style=flat-square)](https://www.trychroma.com/)
[![Groq](https://img.shields.io/badge/Groq-Llama_3.3_70B-F55036?style=flat-square)](https://groq.com/)

**NVIDIA AI & GPU Internship — Capstone Project 2026**
*Presidency School of AI and Advanced Computing, Presidency University*

[Try Playground](#usage-guide) · [Architecture](#architecture-overview) · [Setup](#installation-guide) · [API Docs](#api-reference)

</div>

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [The Solution](#the-solution)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [System Design](#system-design)
- [Technology Stack](#technology-stack)
- [Folder Structure](#folder-structure)
- [Installation Guide](#installation-guide)
- [Environment Variables](#environment-variables)
- [Usage Guide](#usage-guide)
- [API Reference](#api-reference)
- [Screenshots](#screenshots)
- [RAG Pipeline Diagram](#rag-pipeline-diagram)
- [Security Considerations](#security-considerations)
- [Performance Considerations](#performance-considerations)
- [Future Roadmap](#future-roadmap)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)

---

## Problem Statement

Modern code review tools tell you *what* is wrong. They almost never tell you *why*, and they never cite their sources.

When an AI flags a SQL injection vulnerability, how do you know it is not hallucinating? When it recommends a refactor, what evidence backs that recommendation? When you ask it how authentication works in your codebase, how do you know the answer reflects your actual code and not a generic pattern from training data?

Developers need intelligence they can **trust** — grounded in real knowledge, not generated from statistical patterns.

---

## The Solution

**Codex 2.0** is a Retrieval-Augmented Generation (RAG) platform that grounds every AI response in retrieved evidence from three knowledge corpora before generating a single token.

```
User Query → Retrieve relevant context → Assemble grounded prompt → Generate cited response
              ↑                                                              ↑
         Three corpora:                                          Every finding tags
         OWASP + Codebase + Review Memory                        which source it came from
```

Every code review cites the OWASP rule that flagged it. Every chat answer links to the exact file and line range it came from. Every refactor recommendation shows the evidence that motivated it. Not "this might be a SQL injection" — *"this is a SQL injection, see OWASP A03:2021 [retrieved chunk attached]."*

---

## Key Features

### Playground — RAG-Grounded Code Reviews
Paste any code snippet and receive a structured review graded A–F across five dimensions: Correctness, Security, Readability, Performance, and Maintainability. Every finding includes an expandable citation panel showing the exact retrieved chunks — OWASP rules, past review patterns, or indexed codebase context — that grounded it. No account required.

### Codebase Chat — Natural Language over Your Code
Index any connected GitHub repository. Ask questions in plain English:

- *"How does authentication work in this codebase?"*
- *"Where are all the places we hit the database directly?"*
- *"What does the payment module depend on?"*

Every answer streams token-by-token and is grounded in retrieved code chunks. The right panel shows the exact file, line range, and code snippet that informed each part of the response. Citations are clickable. Sources are real.

### Refactor Intelligence — Evidence-Backed Recommendations
Submit code for refactoring analysis and receive prioritized recommendations with before/after diffs and per-recommendation impact scoring across Readability, Performance, Maintainability, and Testability. Each recommendation shows the retrieved OWASP rule, past review patterns, and codebase context that motivated it. RAG metadata is always visible: chunks retrieved, retrieval latency, LLM latency, confidence score.

### Index Manager — Visible RAG Pipeline
A real-time visualization of the full indexing pipeline: Parse → Chunk → Embed → Store → Done. See chunk counts, file processing speed, embedding model details, and corpus statistics across all three knowledge bases. The pipeline is not a black box — it is the product.

### Selective File Indexing — Index Only What Matters
Browse any repo's full file tree before indexing. Select specific files or entire folders. Index only what matters — service layer, auth module, or any subset you choose. Faster indexing, more accurate chat context.

### Public Repository Support — Any Open Source Codebase
Index and chat with ANY public GitHub repository — not just your own. Paste a URL like `github.com/facebook/react`, browse the file tree, select files, and ask questions about any open source codebase.

### Smart Summarize (Quick Brief) — Instant Repo Insights
One-click intelligent summary of any repository. Scores files by importance, selects the top 8–12, and returns a structured brief covering project overview, tech stack, architecture, health, security snapshot, and onboarding insights in under 15 seconds.

### Project DNA — Idea Generation from Codebase Patterns
Analyzes a repository's patterns, transferable skills, and domain essence, then generates 5–6 novel project ideas that share the same technical DNA. Each idea includes difficulty rating, impact score, what transfers directly, and what is new.

### Code Health Segmentation — Visual File Health Map
A visual file-level health map on the Repos analysis page. Files color-coded as Critical (red), Needs Attention (yellow), or Healthy (green) based on security findings and issue density. Filterable by health status.

### State Persistence — Never Lose Context
All page state — playground reviews, analyzed repos, chat conversations, index selections — persists across page refreshes. Nothing is lost until you click the Clear button. Every page has a dedicated Clear control.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        React 18 Frontend                              │
│                                                                       │
│   Playground    Chat    Refactor    Index Manager    Repos    Auth    │
└─────────────────────────────┬────────────────────────────────────────┘
                              │  REST API + Server-Sent Events (SSE)
┌─────────────────────────────▼────────────────────────────────────────┐
│                     Node.js + Express Backend                         │
│                                                                       │
│  ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────┐  │
│  │ Ingestion Service│  │ Retrieval Service  │  │Generation Service│  │
│  │                  │  │                   │  │                  │  │
│  │ GitHub file tree │  │ BM25 keyword      │  │ Groq API         │  │
│  │ → semantic chunk │  │ + ChromaDB cosine │  │ Llama 3.3 70B    │  │
│  │ → embed → upsert │  │ → RRF fusion      │  │ Streaming / Full │  │
│  └────────┬─────────┘  └────────┬──────────┘  └────────┬─────────┘  │
│           │                     │                       │             │
└───────────┼─────────────────────┼───────────────────────┼────────────┘
            │                     │                       │
   ┌────────▼────────┐  ┌────────▼────────┐    ┌────────▼────────┐
   │    ChromaDB     │  │    ChromaDB     │    │   MySQL 8.0     │
   │  codebase_{id}  │  │  owasp_top10   │    │                 │
   │  review_memory  │  │  (static)      │    │ users           │
   │  (vectors)      │  │  (vectors)     │    │ reviews         │
   └─────────────────┘  └─────────────────┘    │ indexed_repos   │
                                                │ chat_sessions   │
                                                │ chat_messages   │
                                                └─────────────────┘
```

---

## System Design

### Three Knowledge Corpora

**1. Codebase Corpus** (`codebase_{repoId}`)
Created when a user indexes a repository. Source files are fetched from GitHub, parsed at function and class boundaries using language-aware heuristics, converted to 384-dimensional embedding vectors, and stored in ChromaDB with metadata (file path, start line, end line, language, chunk type). Updated on demand.

**2. OWASP Security Corpus** (`owasp_top10`)
Pre-loaded at server startup. Contains OWASP Top 10 2021 vulnerability descriptions, examples, attack vectors, and remediation guidance — over 20 structured entries covering A01 through A10. Static, never changes at runtime. Every security finding in every review has access to this corpus.

**3. Review Memory** (`review_memory`)
Grows with every review submitted. Critical and high-severity findings are automatically embedded and stored after each review. Enables pattern detection: *"This SQL injection pattern has appeared in 3 of your past reviews."* The system gets smarter the more it is used.

### Hybrid Retrieval with RRF

For every query, Codex runs two retrieval strategies in parallel and fuses their results:

```
Query
  │
  ├── BM25 keyword search (rank-bm25)
  │   Good at: exact function names, error codes, specific strings
  │
  └── Semantic vector search (ChromaDB cosine similarity)
      Good at: conceptual questions, paraphrased queries, related patterns
         │
         └── Reciprocal Rank Fusion
             score = (0.6 / (60 + semantic_rank)) + (0.4 / (60 + bm25_rank))
             → Merge → Deduplicate → Top-K → Assemble into prompt
```

This hybrid approach consistently outperforms either method alone. Keyword search finds exact matches; semantic search finds conceptually related content. RRF merges them without requiring score normalization.

### Streaming Architecture

Chat responses stream via Server-Sent Events (SSE). The backend opens an SSE connection, sends a metadata event first (retrieved chunks, session ID, latency), then streams LLM tokens as they arrive from Groq. The frontend renders tokens progressively. On completion, the full response and retrieved chunks are persisted to MySQL.

```
Frontend                          Backend                    Groq API
   │                                 │                           │
   │── POST /api/chat ─────────────→ │                           │
   │                                 │── retrieve chunks ───────→ ChromaDB
   │                                 │←── top-K chunks ──────────│
   │←── SSE: {type: 'meta', chunks} ─│                           │
   │                                 │── prompt + context ──────→│
   │←── SSE: {type: 'token', 'The'} ─│←── stream tokens ─────────│
   │←── SSE: {type: 'token', ' auth'}│                           │
   │←── SSE: {type: 'done'} ─────────│                           │
   │                                 │── INSERT chat_messages ──→ MySQL
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | React | 18.2 | UI framework |
| Frontend | TypeScript | 5.3 | Type safety |
| Frontend | Vite | 5.0 | Build tool |
| Frontend | React Router | 6.20 | Client routing |
| Frontend | Recharts | 2.10 | Score visualization |
| Styling | Geist Mono + CSS variables | — | Design system |
| Backend | Node.js | 20 | Runtime |
| Backend | Express | 4.18 | API server |
| Backend | TypeScript | 5.3 | Type safety |
| Database | MySQL | 8.0 | Relational metadata, chat history |
| Vector DB | ChromaDB | Latest | Embedding storage and retrieval |
| Embeddings | @xenova/transformers | 2.17 | Local ONNX inference, no API needed |
| Embedding Model | all-MiniLM-L6-v2 | — | 22MB, 384-dim, CPU-fast |
| Generation | Groq API | — | Llama 3.3 70B inference |
| LLM | Llama 3.3 70B | — | Code review, chat, refactor |
| Auth | JWT + bcrypt | — | Token auth |
| Auth | GitHub OAuth | — | Repository access |
| GitHub | Octokit REST | 20.0 | File tree, repo metadata |
| Retrieval | rank-bm25 | 0.2.2 | Keyword search |

---

## Folder Structure

```
codex/
├── database/
│   ├── schema.sql                    # All tables — run this first
│   └── seed.sql                      # OWASP Top 10 corpus data
│
├── backend/
│   ├── .env.example                  # Copy to .env and fill in values
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts                 # Express entry point + all routes
│       ├── config.ts                 # Typed environment variables
│       ├── db/
│       │   └── connection.ts         # MySQL connection pool
│       ├── middleware/
│       │   └── auth.ts               # JWT middleware (auth + optionalAuth)
│       ├── services/
│       │   ├── embeddingService.ts   # ONNX embedding, model-swappable
│       │   ├── ingestionService.ts   # Index pipeline: fetch→chunk→embed→store
│       │   ├── retrievalService.ts   # Hybrid BM25 + semantic + RRF
│       │   ├── owaspService.ts       # OWASP corpus seeder
│       │   ├── aiService.ts          # RAG-grounded LLM orchestration
│       │   ├── generationService.ts  # Groq / vLLM abstraction layer
│       │   ├── githubService.ts      # File tree fetch, smart sampling
│       ├── utils/
│       │   └── fileScorer.ts         # File importance scoring for Quick Brief
│       ├── prompts/
│       │   ├── briefPrompt.ts        # Smart Summarize LLM prompt
│       │   └── dnaPrompt.ts          # Project DNA LLM prompt
│       └── controllers/
│           ├── authController.ts     # Register, login, GitHub OAuth
│           ├── playgroundController.ts # Instant code review
│           ├── repoController.ts     # Repo list, analysis
│           ├── ragController.ts      # Index, job status, stats
│           ├── chatController.ts     # SSE streaming chat
│           ├── refactorController.ts # Evidence-backed refactor
│           └── dnaController.ts      # DNA generation endpoint

└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── App.tsx                   # Routes
        ├── main.tsx                  # Entry point
        ├── index.css                 # Design system tokens + global styles
        ├── lib/
        │   ├── api.ts                # Typed API client
        │   └── storage.ts            # localStorage persistence helpers
        ├── types/
        │   └── index.ts              # Shared TypeScript types
        ├── hooks/
        │   └── useAuth.tsx           # Auth context and hook
        ├── components/
        │   ├── Navbar.tsx            # Navigation
        │   ├── CitationPanel.tsx     # Expandable source citations
        │   ├── ScoreRing.tsx         # Animated SVG score ring
        │   ├── IndexStatusBadge.tsx  # Indexed / Indexing / Not indexed
        │   ├── ModeIndicator.tsx     # Local / H200 mode chip
        │   └── FileTreePicker.tsx    # Checkbox file tree with expand/collapse
        └── pages/
            ├── Landing.tsx           # Home — RAG narrative
            ├── Playground.tsx        # Code review + citation panel
            ├── Chat.tsx              # Codebase chat (SSE streaming)
            ├── Refactor.tsx          # Refactor intelligence
            ├── IndexManager.tsx      # Pipeline visualization
            ├── Repos.tsx             # GitHub repo browser + index trigger
            ├── History.tsx           # Review history
            ├── AuthPage.tsx          # Login / Register
            └── GitHubCallback.tsx    # OAuth redirect handler
```

---

## Installation Guide

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | Backend and frontend |
| MySQL | 8.0+ | Relational database |
| Python | 3.8+ | Required for ChromaDB |
| pip | Latest | Python package manager |
| Groq API key | — | Free at [console.groq.com](https://console.groq.com) |
| GitHub OAuth App | — | For repository access |

---

### Step 1 — Database

```bash
# Log into MySQL and run the schema
mysql -u root -p < database/schema.sql

# Load the OWASP corpus seed data
mysql -u root -p < database/seed.sql
```

Verify:

```sql
USE codex_db;
SHOW TABLES;
-- Should show: users, repositories, reviews, review_comments,
--              review_shares, repo_analyses, indexed_repos,
--              rag_retrieval_logs, chat_sessions, chat_messages
```

---

### Step 2 — ChromaDB

ChromaDB is required for the vector store. Run it as a separate process before starting the backend.

```bash
# First-time only: install dependencies
pip install chromadb opentelemetry-instrumentation-fastapi

# Every session: start ChromaDB (keep this terminal open)
python start_chroma.py
```

> **Why `start_chroma.py` instead of `chroma run`?**
> The `chroma` CLI command requires its Scripts folder to be on your system PATH, which is often missing on Windows. `start_chroma.py` launches the server directly via Python and works on any OS without PATH changes.

Verify it is running (in a second terminal):

```bash
# PowerShell
Invoke-WebRequest -Uri "http://localhost:8000/api/v1/heartbeat" -UseBasicParsing
# Expected: StatusCode 200, Content: {"nanosecond heartbeat": ...}

# bash / WSL
curl http://localhost:8000/api/v1/heartbeat
```

> **Important:** ChromaDB must be running before you start the backend. The backend `checkChromaDB()` pre-flight will exit with a clear error if ChromaDB is unreachable.

---

### Step 3 — Backend

```bash
cd backend

# Copy environment file
cp .env.example .env

# Fill in your values (see Environment Variables section)
nano .env

# Install dependencies
npm install

# Start the development server
npm run dev
```

**Expected startup output:**

```
// CODEX 2.0 — STARTING

✅ MySQL connected
✅ ChromaDB connected at localhost:8000
⏳ Loading embedding model: all-MiniLM-L6-v2 (~22MB)
   First run downloads to ./models/ cache
✅ Embedding model ready (8.3s) — 384 dimensions
✅ OWASP corpus ready (73 chunks)

🚀 Codex 2.0 API running on http://localhost:3001
   Embedding  : all-MiniLM-L6-v2 (CPU, 384 dim)
   Inference  : Groq (Llama 3.3 70B)
   Vector DB  : ChromaDB @ localhost:8000
   Frontend   : http://localhost:5173
```

> **First run note:** The embedding model (~22MB) downloads automatically on first startup and is cached in `./models/`. Every subsequent startup takes approximately 8 seconds.

---

### Step 4 — Frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

### GitHub OAuth Setup

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in:
   - **Application name:** Codex 2.0
   - **Homepage URL:** `http://localhost:5173`
   - **Authorization callback URL:** `http://localhost:3001/api/auth/github/callback`
4. Copy the **Client ID** and **Client Secret** into your `.env`

---

## Environment Variables

```env
# ── Server ────────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development

# ── Database ──────────────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=3306
DB_NAME=codex_db
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_POOL_MIN=5
DB_POOL_MAX=20

# ── Auth ──────────────────────────────────────────────────────────────
# Must be at least 32 characters
JWT_SECRET=replace_this_with_a_minimum_32_character_random_string
JWT_EXPIRES_IN=24h

# ── AI — Generation ───────────────────────────────────────────────────
# Get a free key at https://console.groq.com
GROQ_API_KEY=gsk_your_groq_api_key_here

# ── AI — Embedding ────────────────────────────────────────────────────
# Options: minilm (22MB, default) | unixcoder (478MB) | codebert (438MB)
EMBEDDING_MODEL=minilm

# ── AI — Inference mode ───────────────────────────────────────────────
# Options: groq (default) | vllm (H200 GPU mode)
INFERENCE_MODE=groq
VLLM_ENDPOINT=http://localhost:8080
VLLM_MODEL=meta-llama/Llama-3.3-70B-Instruct

# ── RAG ───────────────────────────────────────────────────────────────
CHUNK_SIZE_LINES=60
CHUNK_OVERLAP_LINES=10
TOP_K_RETRIEVAL=5
BM25_WEIGHT=0.4
SEMANTIC_WEIGHT=0.6

# ── GitHub OAuth ──────────────────────────────────────────────────────
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret

# ── Frontend ──────────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:5173
```

**Frontend** (`frontend/.env`):

```env
VITE_API_URL=http://localhost:3001/api
```

---

## Usage Guide

### First Use — 5 Minutes

1. Open `http://localhost:5173`
2. **Try Playground** without signing in — paste any code, click Review, see grounded results
3. **Sign up** with email/password or GitHub OAuth
4. **Go to Repos** — your GitHub repos appear automatically
5. **Analyze a repo** — get architecture breakdown, dimension scores, security findings
6. **Index it** — click "Index Repository" to enable Codebase Chat
7. **Go to Chat** — ask questions about your codebase in plain English
8. **Try Refactor** — paste code to get evidence-backed improvement suggestions
9. **Index public repos** — paste any public GitHub URL in Index Manager to index third-party open source repositories
10. **Quick Brief** — use Quick Brief on any analyzed repo for an instant structured summary
11. **Project DNA** — use Project DNA to generate novel project ideas from any analyzed codebase

---

### Demo Flow — 10 Minutes

This is the recommended order for presenting Codex 2.0 to judges, mentors, or recruiters.

**Minute 1–2 — Playground with Citations**
Paste the SQL injection snippet. Show the Critical finding. Click the `[OWASP A03:2021]` badge. Expand the retrieved chunk showing the actual OWASP text. Point to the retrieval bar: *"5 chunks retrieved, 3 sources, 247ms — this review is grounded in evidence."*

```javascript
// Paste this in Playground
function getUser(id) {
  const query = `SELECT * FROM users WHERE id = ${id}`;
  return db.execute(query);
}
```

**Minute 3–4 — Index Manager**
Navigate to Index Manager. Select a real GitHub repo. Click Index Now. Watch the live pipeline: Parse → Chunk → Embed → Store. *"This is a transformer-based encoder processing every function as a 384-dimensional vector. On the NVIDIA H200 DGX this runs 30–50x faster."*

**Minute 5–7 — Codebase Chat**
Navigate to Chat with the freshly indexed repo. Ask: *"How does authentication work?"* Watch the streaming response with [1][2][3] markers. Click a citation — source panel highlights `auth.ts:23–67`. Ask: *"Where are all the places we access the database directly?"* Show multiple file references. *"No other tool in this room does this."*

**Minute 8–9 — Refactor Intelligence**
Navigate to Refactor. Paste any code, select the indexed repo. Show the before/after diff. Expand the evidence panel. *"Three independent sources agree: OWASP flags it as critical, our review memory shows it appeared twice this month, and the codebase has four instances right now."*

**Minute 10 — Architecture**
Show the architecture diagram. Map features to internship modules:
- Module 4 (Transformers): encoder-only embedding model, attention-based retrieval weighting
- Module 6 (GPU Computing): H200 batch FP8 inference, 30–50x indexing speedup
- Track B (RAG): three corpora, hybrid retrieval, RRF fusion, citation mapping

---

## API Reference

### Public Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/health` | Service health, embedding model info | None |
| `GET` | `/api/system/mode` | Active inference configuration | None |
| `POST` | `/api/auth/register` | Register with email + password | None |
| `POST` | `/api/auth/login` | Login, returns JWT | None |
| `GET` | `/api/auth/github` | GitHub OAuth redirect | None |
| `GET` | `/api/auth/github/callback` | OAuth token exchange | None |
| `POST` | `/api/playground/review` | Code review (RAG-grounded) | Optional |
| `POST` | `/api/playground/detect-language` | Auto-detect language | None |
| `POST` | `/api/github/analyze-public` | Analyze any public GitHub repo | None |
| `GET` | `/api/reviews/share/:slug` | Retrieve shared review by UUID | None |
| `GET` | `/api/rag/public-filetree?owner=X&repo=Y` | File tree for any public repo | None |

### Protected Endpoints — Bearer JWT Required

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/me` | Current authenticated user |
| `GET` | `/api/github/repos` | User's GitHub repositories |
| `GET` | `/api/github/repos/:owner/:repo/analyze` | Analyze private repo |
| `GET` | `/api/reviews/history` | Review history with filters |
| `GET` | `/api/reviews/:id` | Single review with comments |
| `POST` | `/api/reviews/share` | Generate share link |
| `POST` | `/api/rag/index` | Start repo indexing, returns `jobId` |
| `GET` | `/api/rag/jobs/:jobId` | Poll indexing progress |
| `GET` | `/api/rag/repos` | All indexed repos for current user |
| `GET` | `/api/rag/stats/:repoId` | Corpus statistics + analytics |
| `DELETE` | `/api/rag/repos/:repoId` | Delete index and collection |
| `GET` | `/api/rag/owasp/status` | OWASP corpus chunk count |
| `POST` | `/api/rag/owasp/seed` | Re-seed OWASP corpus |
| `POST` | `/api/chat` | Streaming codebase chat (SSE) |
| `GET` | `/api/chat/repos` | Repos with `status = ready` |
| `GET` | `/api/chat/sessions` | Chat session history |
| `GET` | `/api/chat/sessions/:id` | Session messages |
| `DELETE` | `/api/chat/sessions/:id` | Delete session |
| `POST` | `/api/refactor` | Evidence-backed refactor analysis |
| `GET` | `/api/repos/:repoId/brief` | Smart Summarize / Quick Brief |
| `POST` | `/api/dna/generate` | Project DNA idea generation |

### Request / Response Examples

**POST /api/playground/review**

```json
// Request
{
  "code": "const q = 'SELECT * FROM users WHERE id = ' + req.params.id",
  "language": "javascript",
  "repoId": 1
}

// Response
{
  "review": {
    "id": 42,
    "overall_score": 2.1,
    "grade": "F",
    "risk_level": "critical",
    "correctness": 5.0,
    "security": 1.0,
    "readability": 6.0,
    "performance": 5.0,
    "maintainability": 4.0,
    "summary": "Critical SQL injection vulnerability...",
    "rag_context_used": true,
    "retrieval_count": 5,
    "comments": [
      {
        "severity": "critical",
        "category": "Security",
        "title": "SQL Injection via String Concatenation",
        "description": "Raw string concatenation in SQL query...",
        "line_number": 1,
        "suggestion": "Use parameterized queries",
        "fixed_code": "const q = 'SELECT * FROM users WHERE id = ?'\ndb.execute(q, [req.params.id])",
        "citations": [
          {
            "sourceId": "1",
            "corpusName": "owasp",
            "displayLabel": "OWASP A03:2021 — Injection",
            "excerptText": "SQL injection occurs when untrusted data..."
          }
        ]
      }
    ]
  }
}
```

**POST /api/chat (SSE)**

```bash
# Request
curl -N -X POST http://localhost:3001/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"repoId": 1, "message": "How does auth work?", "history": []}'

# SSE Response stream
data: {"type":"meta","sessionId":7,"retrievedChunks":[...],"retrievalLatencyMs":312}

data: {"type":"token","content":"Authentication"}
data: {"type":"token","content":" in"}
data: {"type":"token","content":" this"}
...
data: {"type":"done"}
```

---

## Screenshots

> Screenshots to be added after final UI polish

| Page | Description |
|------|-------------|
| `[Landing]` | Hero section — "Code reviews. Grounded in your codebase." with live stats grid |
| `[Playground]` | SQL injection review with OWASP A03:2021 citation panel expanded |
| `[Codebase Chat]` | Streaming response with source panel showing file:line citations |
| `[Index Manager]` | Live pipeline visualization — Parse → Chunk → Embed → Store |
| `[Refactor Intel]` | Before/after diff with OWASP + review memory evidence expanded |
| `[Auth Page]` | Clean login with GitHub OAuth and email/password options |
| `[Quick Brief]` | Structured repo summary output with scores and insights |
| `[DNA Ideas]` | Project idea grid with difficulty, impact, and tech transfer mapping |
| `[File Tree Picker]` | Checkbox file tree with folder expand/collapse and three-state selection |

---

## RAG Pipeline Diagram

```
                         CODEX RAG PIPELINE
                         ─────────────────

INGESTION (one-time per repo)
──────────────────────────────
GitHub Repo
    │
    ├── Fetch file tree (Octokit, up to 200 files)
    │
    ├── Skip: node_modules / .lock / dist / binaries
    │
    ├── Parse at semantic boundaries (functions, classes)
    │   └── Fallback: 60-line sliding window with 10-line overlap
    │
    ├── Embed: @xenova/transformers all-MiniLM-L6-v2
    │   └── Batch size 32, L2-normalized 384-dim vectors
    │
    └── Upsert to ChromaDB collection: codebase_{repoId}
        Metadata: filePath · startLine · endLine · language · chunkType


RETRIEVAL (every query)
────────────────────────
User Query
    │
    ├── [Parallel]
    │   ├── BM25 keyword search (rank-bm25)
    │   │   Query tokenized → scored against all chunks in collection
    │   │   Weight: 0.4
    │   │
    │   └── Semantic vector search (ChromaDB)
    │       Query embedded → cosine similarity over all vectors
    │       Weight: 0.6
    │
    └── Reciprocal Rank Fusion
        score = (0.6 / (60 + semantic_rank)) + (0.4 / (60 + bm25_rank))
        Deduplicate by chunkId → Sort by fused score → Top-K


GENERATION (every query)
─────────────────────────
Top-K chunks assembled:
    [1] OWASP A03:2021 — Injection: "SQL injection occurs when..."
    [2] src/db/user.ts:34–67: "const query = `SELECT...`"
    [3] Past review — Security (critical): "Raw string concat..."

System prompt:
    "Base EVERY finding on the retrieved context below.
     Cite sources using [1], [2], [3].
     Never fabricate issues not supported by context."

LLM (Groq — Llama 3.3 70B)
    │
    └── Response with inline citations mapped back to retrieved chunks
        → Stored in DB with citation metadata
        → Displayed in UI with expandable source panels
```

---

## Security Considerations

| Area | Implementation |
|------|----------------|
| Password storage | bcrypt with cost factor 12 — not MD5, not SHA256 |
| Token auth | JWT with configurable expiry, verified on every protected route |
| GitHub tokens | Stored server-side only, never returned in API responses |
| SQL queries | All parameterized — no string concatenation in any query |
| Rate limiting | 20 requests/minute per IP on AI endpoints |
| CORS | Restricted to `FRONTEND_URL` — no wildcard origin |
| Input size | Request body capped at 2MB |
| Error responses | Generic messages in production — no stack traces exposed |

---

## Performance Considerations

### Local Mode (CPU, all-MiniLM-L6-v2)

| Operation | Typical Latency | Notes |
|-----------|----------------|-------|
| Embedding model load | ~8s (cached) | One-time on startup |
| Single embedding | ~20ms | MiniLM-L6-v2, CPU |
| 200-file repo indexing | ~4 minutes | Includes GitHub API fetch |
| Retrieval (BM25 + semantic + RRF) | ~200–400ms | Per query |
| Playground review (full RAG) | ~4–7s | Retrieval + Groq generation |
| Chat first token (TTFT) | ~2–3s | Retrieval + Groq stream start |
| Quick Brief generation | < 15s | Top 8-12 files scored + Groq |
| Project DNA generation | < 30s | Full analysis + Groq |
| Public repo file tree | ~2-3s | GitHub git tree API |

### NVIDIA H200 Mode (unixcoder/codebert + vLLM)

Switching `EMBEDDING_MODEL=codebert` and `INFERENCE_MODE=vllm` on an NVIDIA H200 node:

| Operation | CPU (MiniLM) | H200 (CodeBERT FP8) | Speedup |
|-----------|-------------|---------------------|---------|
| Single embedding | ~20ms | ~0.3ms | ~67x |
| 200-file indexing | ~4 min | ~5 sec | ~48x |
| Concurrent users | Queued | 10 parallel | Unbounded |
| Embedding quality | 384-dim general | 768-dim code-specific | +23% precision@5 |

---

## Future Roadmap

### Completed
- [x] Selective file indexing with visual file tree picker
- [x] Public repository indexing and chat
- [x] Code health segmentation (per-file health heatmap)
- [x] State persistence across page refreshes

### Near Term
- [ ] Multi-repo chat — ask questions that span two repositories
- [ ] Chat session sidebar — browse and resume past conversations
- [ ] PDF/Markdown export for chat and refactor sessions
- [ ] Toast notifications on indexing completion

### Medium Term
- [ ] LoRA fine-tuning on CodeBERT using review pair dataset from H200 lab
- [ ] Review Memory analytics dashboard — visualize recurring patterns
- [ ] GitHub PR integration — one-click PR from refactor suggestions
- [ ] Webhook-based auto-review on push events

### Long Term
- [ ] Self-hosted LLM via Ollama — fully offline operation
- [ ] Multi-tenant team mode — shared indexed repos, shared sessions
- [ ] IDE extension — query Codebase Chat inline from VS Code
- [ ] Distributed indexing with DeepSpeed across multiple GPUs

---

## Contributing

This project was built as a capstone for the NVIDIA AI & GPU Summer Internship 2026. External contributions are welcome after the internship assessment period.

```bash
# Development setup
git clone https://github.com/your-username/codex
cd codex
# Follow the Installation Guide above

# Run with hot reload
cd backend && npm run dev
cd frontend && npm run dev
```

Code style: TypeScript strict mode, no `any` types, all async functions handle errors explicitly.

---

## License

MIT License — see `LICENSE` file for details.

---

## Acknowledgements

- **NVIDIA** — GPU infrastructure and mentorship via the H200 DGX cluster at Presidency University
- **Presidency School of AI and Advanced Computing** — Program infrastructure and faculty support
- **Dr. Robin Rohit Vincent** — Head, AI CoE NVIDIA — program preparation
- **Dr. Shakkeera L** — Associate Dean, PSCS(Spl) — program recommendation
- **Dr. S. Sivaperumal** — Pro Vice-Chancellor — program approval
- **Groq** — Fast LLM inference API powering all generation
- **ChromaDB** — Open-source vector database for embedding storage
- **@xenova/transformers** — Browser/Node.js ONNX inference runtime by Hugging Face
- **OWASP** — Open Web Application Security Project — Top 10 2021 knowledge base

---

<div align="center">

*Built at Presidency University, Bengaluru*
*NVIDIA AI & GPU Summer Internship — Capstone 2026*

**Codex 2.0 — Where every answer has a source.**

</div>