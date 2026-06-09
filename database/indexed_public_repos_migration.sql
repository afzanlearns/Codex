-- ============================================================
-- CODEX — Universal Repository Indexing Migration
-- indexed_public_repos_migration.sql
-- Run this in MySQL: mysql -u root -p codex_db < database/indexed_public_repos_migration.sql
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
-- INDEXED PUBLIC REPOS TABLE
-- For storing public repositories indexed for RAG chat
-- ============================================================

CREATE TABLE IF NOT EXISTS indexed_public_repos (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  owner              VARCHAR(255) NOT NULL,
  repo_name          VARCHAR(255) NOT NULL,
  github_url         VARCHAR(500) NOT NULL,
  chroma_collection_name VARCHAR(255) NOT NULL,
  files_count        INT DEFAULT 0,
  chunks_count       INT DEFAULT 0,
  status             ENUM('pending', 'indexing', 'ready', 'failed') DEFAULT 'pending',
  error_message      TEXT,
  indexed_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at       TIMESTAMP NULL,
  UNIQUE KEY unique_owner_repo (owner, repo_name),
  INDEX idx_collection (chroma_collection_name)
);

-- Cleanup helpers
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;

-- ============================================================
-- VERIFY: Show table
-- ============================================================

SELECT
  table_name,
  table_rows,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.TABLES
WHERE table_schema = 'codex_db'
AND table_name = 'indexed_public_repos';