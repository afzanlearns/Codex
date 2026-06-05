-- ============================================================
-- CODEX 2.0 — AI Code Review Platform
-- Database Schema (schema.sql)
-- MySQL 8.0+
-- ============================================================

CREATE DATABASE IF NOT EXISTS codex_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE codex_db;

-- ============================================================
-- IDENTITY TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(255) UNIQUE,           -- nullable for GitHub-only users
  password_hash   VARCHAR(255),                  -- nullable for GitHub-only users
  github_id       VARCHAR(50) UNIQUE,
  github_username VARCHAR(100),
  github_avatar   VARCHAR(500),
  github_token    TEXT,                          -- encrypted/raw, for API calls post-login
  current_score   DECIMAL(5,2) DEFAULT 0.00,
  total_reviews   INT DEFAULT 0,
  role            ENUM('developer','admin') DEFAULT 'developer',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- REPOSITORY LAYER
-- ============================================================

CREATE TABLE IF NOT EXISTS repositories (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  github_repo_id  BIGINT,
  owner           VARCHAR(100) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  full_name       VARCHAR(200) NOT NULL,         -- owner/name
  description     TEXT,
  language        VARCHAR(50),
  is_private      BOOLEAN DEFAULT FALSE,
  stars           INT DEFAULT 0,
  health_score    DECIMAL(5,2),
  last_analyzed_at TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_full_name (full_name)
);

-- ============================================================
-- REVIEWS & COMMENTS LAYER
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT,
  repo_id         INT,
  code_snippet    MEDIUMTEXT,
  language        VARCHAR(50),
  overall_score   DECIMAL(4,2),
  grade           CHAR(1),
  risk_level      ENUM('low','medium','high','critical'),
  correctness     DECIMAL(4,2),
  security        DECIMAL(4,2),
  readability     DECIMAL(4,2),
  performance     DECIMAL(4,2),
  maintainability DECIMAL(4,2),
  summary         TEXT,
  rag_context_used BOOLEAN DEFAULT FALSE,        -- NEW: was RAG used for this review?
  retrieval_count  INT DEFAULT 0,                -- NEW: how many chunks retrieved
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS review_comments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  review_id       INT NOT NULL,
  severity        ENUM('critical','high','medium','low','info'),
  category        VARCHAR(50),
  title           VARCHAR(200),
  description     TEXT,
  line_number     INT,
  suggestion      TEXT,
  fixed_code      TEXT,
  citation_source VARCHAR(200),                  -- NEW: e.g. "OWASP A03:2021" or "Past review #47"
  citation_text   TEXT,                          -- NEW: the retrieved chunk that grounded this finding
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  INDEX idx_review_id (review_id)
);

CREATE TABLE IF NOT EXISTS review_shares (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  review_id       INT NOT NULL,
  slug            VARCHAR(36) UNIQUE NOT NULL,   -- UUID
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at      TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS repo_analyses (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  repo_id         INT,
  user_id         INT,
  repo_url        VARCHAR(500),
  overall_score   DECIMAL(4,2),
  structure_score DECIMAL(4,2),
  quality_score   DECIMAL(4,2),
  security_score  DECIMAL(4,2),
  documentation_score DECIMAL(4,2),
  testing_score   DECIMAL(4,2),
  performance_score DECIMAL(4,2),
  maintainability_score DECIMAL(4,2),
  dependencies_score DECIMAL(4,2),
  summary         TEXT,
  architecture    JSON,
  recommendations JSON,
  security_findings JSON,
  language_distribution JSON,
  how_to_run      TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- RAG INDEXING & LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS indexed_repos (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  repo_id           INT NOT NULL,
  user_id           INT NOT NULL,
  status            ENUM('pending','indexing','ready','failed') DEFAULT 'pending',
  chunk_count       INT DEFAULT 0,
  files_processed   INT DEFAULT 0,
  total_files       INT DEFAULT 0,
  embedding_model   VARCHAR(100) DEFAULT 'all-MiniLM-L6-v2',
  chroma_collection VARCHAR(200),               -- collection name in ChromaDB
  index_duration_ms INT,                        -- how long indexing took
  error_message     TEXT,
  last_indexed_at   TIMESTAMP,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_repo_user (repo_id, user_id)
);

CREATE TABLE IF NOT EXISTS rag_retrieval_logs (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  session_type      ENUM('review','chat','refactor'),
  user_id           INT,
  repo_id           INT,
  query_text        TEXT,
  corpora_queried   JSON,                        -- ["codebase_123", "owasp", "review_memory"]
  chunks_retrieved  INT DEFAULT 0,
  retrieval_latency_ms INT,
  top_similarity_score DECIMAL(5,4),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

-- ============================================================
-- CHAT CONVERSATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  repo_id           INT NOT NULL,
  title             VARCHAR(200),               -- auto-generated from first message
  message_count     INT DEFAULT 0,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
  INDEX idx_user_repo (user_id, repo_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  session_id        INT NOT NULL,
  role              ENUM('user','assistant'),
  content           TEXT NOT NULL,
  retrieved_chunks  JSON,                        -- array of {chunkId, filePath, startLine, endLine, score}
  retrieval_latency_ms INT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
  INDEX idx_session_id (session_id)
);

-- ============================================================
-- OWASP TOP 10 RULES CORPUS
-- ============================================================

CREATE TABLE IF NOT EXISTS owasp_rules (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  owasp_id        VARCHAR(20) NOT NULL,          -- e.g., "A03:2021"
  category        VARCHAR(100) NOT NULL,         -- e.g., "Injection"
  title           VARCHAR(200) NOT NULL,         -- e.g., "SQL Injection"
  severity        VARCHAR(20) NOT NULL,          -- e.g., "critical"
  description     TEXT NOT NULL,
  examples        TEXT,
  remediation     TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

