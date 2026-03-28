-- ============================================================
-- CODEX — AI Code Review Platform
-- Database Schema (schema.sql)
-- MySQL 8.0+
-- Run this file first, then: procedures.sql → triggers.sql → views.sql → events.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS codex_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE codex_db;

-- Enable event scheduler (run as root if needed)
SET GLOBAL event_scheduler = ON;

-- ============================================================
-- LOOKUP / TAXONOMY TABLES
-- ============================================================

-- Issue taxonomy: normalized category lookup (no duplication in comment_categories)
CREATE TABLE IF NOT EXISTS issue_taxonomy (
    id          TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug        VARCHAR(50)  NOT NULL UNIQUE,   -- e.g. 'security', 'bug', 'smell'
    label       VARCHAR(100) NOT NULL,
    description TEXT,
    severity    ENUM('info', 'low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO issue_taxonomy (slug, label, severity) VALUES
    ('bug',           'Logic Bug',              'high'),
    ('security',      'Security Vulnerability', 'critical'),
    ('performance',   'Performance Issue',      'medium'),
    ('readability',   'Readability Problem',    'low'),
    ('smell',         'Code Smell',             'low'),
    ('docs',          'Missing Documentation',  'info'),
    ('style',         'Style Violation',        'info'),
    ('test',          'Missing or Weak Tests',  'medium'),
    ('complexity',    'Cyclomatic Complexity',  'medium'),
    ('type_safety',   'Type Safety Issue',      'medium');

-- ============================================================
-- IDENTITY TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(150)  NOT NULL,
    email               VARCHAR(255)  NOT NULL UNIQUE,
    password_hash       VARCHAR(255),                        -- NULL for OAuth users
    github_id           BIGINT UNSIGNED UNIQUE,
    github_username     VARCHAR(100),
    github_access_token TEXT,                                -- encrypted in production
    avatar_url          VARCHAR(500),
    current_score       DECIMAL(4,2) DEFAULT 0.00,          -- maintained by trigger
    total_reviews       INT UNSIGNED DEFAULT 0,
    badge               ENUM('newcomer','consistent','improving','declining','pattern_offender') DEFAULT 'newcomer',
    role                ENUM('developer','lead','admin') DEFAULT 'developer',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    owner_id    INT UNSIGNED NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_team_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS team_members (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    team_id     INT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    role        ENUM('member','lead','admin') DEFAULT 'member',
    joined_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_team_user (team_id, user_id),
    CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- REPOSITORY LAYER
-- ============================================================

CREATE TABLE IF NOT EXISTS repositories (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    team_id             INT UNSIGNED NOT NULL,
    github_repo_id      BIGINT UNSIGNED UNIQUE,
    full_name           VARCHAR(255) NOT NULL,               -- e.g. "org/repo-name"
    url                 VARCHAR(500) NOT NULL,
    default_branch      VARCHAR(100) DEFAULT 'main',
    language            VARCHAR(50),
    webhook_id          BIGINT UNSIGNED,
    webhook_active      BOOLEAN DEFAULT FALSE,
    avg_score           DECIMAL(4,2) DEFAULT 0.00,           -- maintained by trigger
    total_prs_reviewed  INT UNSIGNED DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_repo_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Per-repo custom AI rules (injected into prompt)
CREATE TABLE IF NOT EXISTS custom_rules (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    repository_id   INT UNSIGNED NOT NULL,
    created_by      INT UNSIGNED NOT NULL,
    rule_text       TEXT NOT NULL,                           -- plain English
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rule_repo FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    CONSTRAINT fk_rule_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- PR & REVIEW LAYER
-- ============================================================

CREATE TABLE IF NOT EXISTS pull_requests (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    repository_id   INT UNSIGNED NOT NULL,
    developer_id    INT UNSIGNED NOT NULL,
    github_pr_id    BIGINT UNSIGNED,
    pr_number       INT UNSIGNED,
    title           VARCHAR(500),
    base_branch     VARCHAR(100),
    head_branch     VARCHAR(100),
    state           ENUM('open','closed','merged') DEFAULT 'open',
    additions       INT UNSIGNED DEFAULT 0,
    deletions       INT UNSIGNED DEFAULT 0,
    changed_files   SMALLINT UNSIGNED DEFAULT 0,
    github_url      VARCHAR(500),
    merged_at       TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_repo_pr (repository_id, pr_number),
    CONSTRAINT fk_pr_repo   FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_dev    FOREIGN KEY (developer_id)  REFERENCES users(id) ON DELETE CASCADE
);

-- Individual files changed within a PR
CREATE TABLE IF NOT EXISTS pr_files (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pull_request_id INT UNSIGNED NOT NULL,
    filename        VARCHAR(500) NOT NULL,
    status          ENUM('added','modified','removed','renamed') DEFAULT 'modified',
    additions       INT UNSIGNED DEFAULT 0,
    deletions       INT UNSIGNED DEFAULT 0,
    patch           MEDIUMTEXT,                              -- raw diff
    CONSTRAINT fk_prf_pr FOREIGN KEY (pull_request_id) REFERENCES pull_requests(id) ON DELETE CASCADE
);

-- Aggregate review result per PR
CREATE TABLE IF NOT EXISTS reviews (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pull_request_id     INT UNSIGNED,                        -- NULL for playground reviews
    developer_id        INT UNSIGNED NOT NULL,
    repository_id       INT UNSIGNED,                        -- NULL for playground
    is_playground       BOOLEAN DEFAULT FALSE,
    language            VARCHAR(50),
    score_overall       DECIMAL(4,2) NOT NULL,               -- 0.00–10.00
    score_correctness   DECIMAL(4,2) NOT NULL,
    score_readability   DECIMAL(4,2) NOT NULL,
    score_security      DECIMAL(4,2) NOT NULL,
    score_performance   DECIMAL(4,2) NOT NULL,
    score_maintainability DECIMAL(4,2) NOT NULL,
    summary             TEXT NOT NULL,
    model_used          VARCHAR(100),
    tokens_used         INT UNSIGNED,
    expires_at          TIMESTAMP NULL,                      -- 7 days for playground
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rev_pr    FOREIGN KEY (pull_request_id) REFERENCES pull_requests(id) ON DELETE SET NULL,
    CONSTRAINT fk_rev_dev   FOREIGN KEY (developer_id)    REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_rev_repo  FOREIGN KEY (repository_id)   REFERENCES repositories(id) ON DELETE SET NULL
);

-- Individual findings within a review (full-text indexed)
CREATE TABLE IF NOT EXISTS review_comments (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    review_id       INT UNSIGNED NOT NULL,
    filename        VARCHAR(500),
    line_start      INT UNSIGNED,
    line_end        INT UNSIGNED,
    content         TEXT NOT NULL,                           -- AI finding (FULLTEXT indexed)
    suggestion      TEXT,                                    -- AI fix suggestion
    severity        ENUM('info','low','medium','high','critical') DEFAULT 'medium',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rc_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
);

-- Full-text index on review content for search
ALTER TABLE review_comments ADD FULLTEXT idx_ft_content (content);

-- Junction: comment ↔ taxonomy (many-to-many)
CREATE TABLE IF NOT EXISTS comment_categories (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    comment_id      INT UNSIGNED NOT NULL,
    taxonomy_id     TINYINT UNSIGNED NOT NULL,
    UNIQUE KEY uq_cc (comment_id, taxonomy_id),
    CONSTRAINT fk_cc_comment  FOREIGN KEY (comment_id)  REFERENCES review_comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_cc_taxonomy FOREIGN KEY (taxonomy_id) REFERENCES issue_taxonomy(id) ON DELETE CASCADE
);

-- ============================================================
-- ANALYTICS LAYER
-- ============================================================

-- Weekly materialized snapshot per developer (generated by stored procedure + event)
CREATE TABLE IF NOT EXISTS developer_snapshots (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    developer_id        INT UNSIGNED NOT NULL,
    team_id             INT UNSIGNED NOT NULL,
    week_start          DATE NOT NULL,                       -- Monday of the week
    reviews_count       SMALLINT UNSIGNED DEFAULT 0,
    avg_score           DECIMAL(4,2) DEFAULT 0.00,
    bug_count           SMALLINT UNSIGNED DEFAULT 0,
    security_count      SMALLINT UNSIGNED DEFAULT 0,
    top_issue_slug      VARCHAR(50),
    score_delta         DECIMAL(5,2) DEFAULT 0.00,           -- vs previous week
    rank_in_team        SMALLINT UNSIGNED,
    rank_delta          TINYINT,                             -- +/- vs previous week
    is_pattern_offender BOOLEAN DEFAULT FALSE,
    UNIQUE KEY uq_dev_week (developer_id, week_start),
    CONSTRAINT fk_snap_dev  FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_snap_team FOREIGN KEY (team_id)      REFERENCES teams(id) ON DELETE CASCADE
);

-- Granular score history (every review updates this — used for sparklines)
CREATE TABLE IF NOT EXISTS score_history (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    developer_id    INT UNSIGNED NOT NULL,
    review_id       INT UNSIGNED NOT NULL,
    score           DECIMAL(4,2) NOT NULL,
    recorded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sh_dev    FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sh_review FOREIGN KEY (review_id)    REFERENCES reviews(id) ON DELETE CASCADE
);

-- ============================================================
-- ALERTING LAYER
-- ============================================================

CREATE TABLE IF NOT EXISTS alert_configs (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    team_id         INT UNSIGNED NOT NULL,
    alert_type      ENUM('low_score_merge','pattern_offender','score_drop','security_critical') NOT NULL,
    threshold       DECIMAL(5,2),                            -- e.g. score threshold
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ac_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alert_logs (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    alert_config_id INT UNSIGNED,
    developer_id    INT UNSIGNED,
    team_id         INT UNSIGNED NOT NULL,
    alert_type      VARCHAR(100) NOT NULL,
    message         TEXT,
    context_json    JSON,                                    -- flexible extra data
    resolved        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_al_config FOREIGN KEY (alert_config_id) REFERENCES alert_configs(id) ON DELETE SET NULL,
    CONSTRAINT fk_al_dev    FOREIGN KEY (developer_id)    REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_al_team   FOREIGN KEY (team_id)         REFERENCES teams(id) ON DELETE CASCADE
);

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX idx_reviews_dev_created  ON reviews(developer_id, created_at);
CREATE INDEX idx_reviews_repo_created ON reviews(repository_id, created_at);
CREATE INDEX idx_reviews_score        ON reviews(score_overall);
CREATE INDEX idx_pr_repo_state        ON pull_requests(repository_id, state, created_at);
CREATE INDEX idx_pr_dev               ON pull_requests(developer_id, created_at);
CREATE INDEX idx_snapshots_dev_week   ON developer_snapshots(developer_id, week_start);
CREATE INDEX idx_snapshots_team_week  ON developer_snapshots(team_id, week_start);
CREATE INDEX idx_score_history_dev    ON score_history(developer_id, recorded_at);
CREATE INDEX idx_comments_severity    ON review_comments(severity);
CREATE INDEX idx_alert_logs_team      ON alert_logs(team_id, created_at);
