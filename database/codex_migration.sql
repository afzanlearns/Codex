-- ============================================================
-- CODEX — PR Review Feature Migration
-- codex_migration.sql (MySQL 8.0 Compatibility Version)
-- Run this in MySQL: mysql -u root -p codex_db < database/codex_migration.sql
-- ============================================================

USE codex_db;

-- ============================================================
-- HELPERS: Safe procedures for Columns and Indexes
-- ============================================================

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DELIMITER //
CREATE PROCEDURE AddColumnIfNotExists(
    IN tableName VARCHAR(64),
    IN columnName VARCHAR(64),
    IN columnDef VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = tableName
        AND COLUMN_NAME = columnName
    ) THEN
        SET @sql = CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN ', columnName, ' ', columnDef);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS AddIndexIfNotExists;
DELIMITER //
CREATE PROCEDURE AddIndexIfNotExists(
    IN tableName VARCHAR(64),
    IN indexName VARCHAR(64),
    IN indexDef VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = tableName
        AND INDEX_NAME = indexName
    ) THEN
        SET @sql = CONCAT('CREATE INDEX ', indexName, ' ON ', tableName, indexDef);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- ============================================================
-- WEBHOOK EVENTS LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type   VARCHAR(100) NOT NULL,
  repository   VARCHAR(255),
  payload      JSON,
  processed    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ALTER REPOSITORIES TABLE
-- ============================================================

CALL AddColumnIfNotExists('repositories', 'github_webhook_id', 'BIGINT UNSIGNED NULL');
CALL AddColumnIfNotExists('repositories', 'webhook_secret',    'VARCHAR(255) NULL');
CALL AddColumnIfNotExists('repositories', 'auto_review',       'BOOLEAN DEFAULT TRUE');

-- ============================================================
-- PR FILE DIFFS
-- ============================================================

CREATE TABLE IF NOT EXISTS pr_file_diffs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pull_request_id INT UNSIGNED NOT NULL,
  filename        VARCHAR(500) NOT NULL,
  status          ENUM('added','modified','removed','renamed') DEFAULT 'modified',
  additions       INT UNSIGNED DEFAULT 0,
  deletions       INT UNSIGNED DEFAULT 0,
  patch           MEDIUMTEXT,
  CONSTRAINT fk_pfd_pr FOREIGN KEY (pull_request_id)
    REFERENCES pull_requests(id) ON DELETE CASCADE
);

-- ============================================================
-- GITHUB CHECK RUNS
-- ============================================================

CREATE TABLE IF NOT EXISTS github_check_runs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pull_request_id INT UNSIGNED NOT NULL,
  review_id       INT UNSIGNED NULL,
  check_run_id    BIGINT UNSIGNED NOT NULL,
  status          ENUM('queued','in_progress','completed') DEFAULT 'queued',
  conclusion      VARCHAR(50),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gcr_pr     FOREIGN KEY (pull_request_id)
    REFERENCES pull_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_gcr_review FOREIGN KEY (review_id)
    REFERENCES reviews(id) ON DELETE SET NULL
);

-- ============================================================
-- REVIEW SHARES (if not already created)
-- ============================================================

CREATE TABLE IF NOT EXISTS review_shares (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  review_id  INT UNSIGNED NOT NULL,
  slug       VARCHAR(12) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  view_count INT UNSIGNED DEFAULT 0,
  CONSTRAINT fk_rs_review FOREIGN KEY (review_id)
    REFERENCES reviews(id) ON DELETE CASCADE
);

-- ============================================================
-- TEAM INVITES (if not already created)
-- ============================================================

CREATE TABLE IF NOT EXISTS team_invites (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team_id     INT UNSIGNED NOT NULL,
  invited_by  INT UNSIGNED NOT NULL,
  email       VARCHAR(255) NOT NULL,
  token       VARCHAR(64) NOT NULL UNIQUE,
  role        ENUM('member','lead') DEFAULT 'member',
  accepted    BOOLEAN DEFAULT FALSE,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ti_team FOREIGN KEY (team_id)
    REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_ti_user FOREIGN KEY (invited_by)
    REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- REPO ANALYSES (if not already created)
-- ============================================================

CREATE TABLE IF NOT EXISTS repo_analyses (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  repository_id   INT UNSIGNED NOT NULL,
  developer_id    INT UNSIGNED NOT NULL,
  health_score    DECIMAL(4,2) NOT NULL,
  file_count      INT UNSIGNED DEFAULT 0,
  languages       JSON,
  summary         TEXT,
  strengths       JSON,
  critical_issues JSON,
  recommendations JSON,
  raw_structure   MEDIUMTEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ra_repo FOREIGN KEY (repository_id)
    REFERENCES repositories(id) ON DELETE CASCADE,
  CONSTRAINT fk_ra_dev  FOREIGN KEY (developer_id)
    REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- ALTER USERS (streak + goal columns)
-- ============================================================

CALL AddColumnIfNotExists('users', 'streak_days',         'INT UNSIGNED DEFAULT 0');
CALL AddColumnIfNotExists('users', 'streak_last_date',    'DATE NULL');
CALL AddColumnIfNotExists('users', 'score_goal',          'DECIMAL(4,2) NULL');
CALL AddColumnIfNotExists('users', 'score_goal_deadline', 'DATE NULL');

-- ============================================================
-- ALTER REPOSITORIES (health score + analysis columns)
-- ============================================================

CALL AddColumnIfNotExists('repositories', 'health_score',         'DECIMAL(4,2) DEFAULT 0.00');
CALL AddColumnIfNotExists('repositories', 'health_score_30d_ago', 'DECIMAL(4,2) DEFAULT 0.00');
CALL AddColumnIfNotExists('repositories', 'last_analyzed_at',     'TIMESTAMP NULL');
CALL AddColumnIfNotExists('repositories', 'file_count',           'INT UNSIGNED DEFAULT 0');
CALL AddColumnIfNotExists('repositories', 'primary_language',     'VARCHAR(50) NULL');

-- ============================================================
-- INDEXES
-- ============================================================

CALL AddIndexIfNotExists('pull_requests', 'idx_prs_state_repo', '(repository_id, state, created_at)');
CALL AddIndexIfNotExists('pull_requests', 'idx_prs_developer',  '(developer_id, created_at)');
CALL AddIndexIfNotExists('webhook_events', 'idx_webhook_events_type', '(event_type, created_at)');
CALL AddIndexIfNotExists('webhook_events', 'idx_webhook_events_repo', '(repository, created_at)');
CALL AddIndexIfNotExists('github_check_runs', 'idx_check_runs_pr', '(pull_request_id)');
CALL AddIndexIfNotExists('pr_file_diffs', 'idx_file_diffs_pr', '(pull_request_id)');
CALL AddIndexIfNotExists('review_shares', 'idx_shares_slug', '(slug)');
CALL AddIndexIfNotExists('team_invites', 'idx_invites_token', '(token)');
CALL AddIndexIfNotExists('team_invites', 'idx_invites_email', '(email)');
CALL AddIndexIfNotExists('repo_analyses', 'idx_ra_repo_created', '(repository_id, created_at)');

-- Cleanup helpers
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;

-- ============================================================
-- VERIFY: Show all tables after migration
-- ============================================================

SELECT
  table_name,
  table_rows,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.TABLES
WHERE table_schema = 'codex_db'
ORDER BY table_name;
