import pool from './connection';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

interface OwaspSeedRule {
  owasp_id: string;
  category: string;
  title: string;
  severity: string;
  description: string;
  examples: string;
  remediation: string;
}

const owaspRulesSeed: OwaspSeedRule[] = [
  {
    owasp_id: 'A01:2021',
    category: 'Broken Access Control',
    title: 'Insecure Direct Object Reference (IDOR)',
    severity: 'high',
    description: 'Occurs when a developer exposes a reference to an internal implementation object, such as a file or database key, in a way that allows an attacker to manipulate the reference to access unauthorized data.',
    examples: `// Vulnerable Node/Express endpoint
app.get('/api/user/:id', async (req, res) => {
  const user = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
  res.json(user);
});`,
    remediation: `// Secure version checking ownership
app.get('/api/user/:id', authenticate, async (req, res) => {
  if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const user = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
  res.json(user);
});`
  },
  {
    owasp_id: 'A01:2021',
    category: 'Broken Access Control',
    title: 'Missing Function Level Access Control',
    severity: 'high',
    description: 'Failure to restrict access to sensitive endpoints or admin functionality, allowing standard users to execute actions reserved for administrators.',
    examples: `app.post('/api/admin/delete-user', async (req, res) => {
  await db.query('DELETE FROM users WHERE id = ?', [req.body.userId]);
  res.json({ success: true });
});`,
    remediation: `app.post('/api/admin/delete-user', authenticate, requireRole('admin'), async (req, res) => {
  await db.query('DELETE FROM users WHERE id = ?', [req.body.userId]);
  res.json({ success: true });
});`
  },
  {
    owasp_id: 'A02:2021',
    category: 'Cryptographic Failures',
    title: 'Use of Weak Hash Functions (MD5/SHA1)',
    severity: 'high',
    description: 'Using weak, legacy cryptographic algorithms like MD5 or SHA1 for password hashing or data integrity checks, exposing the system to collisions or dictionary attacks.',
    examples: `const md5 = require('md5');
const hash = md5(password);`,
    remediation: `const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash(password, 12);`
  },
  {
    owasp_id: 'A02:2021',
    category: 'Cryptographic Failures',
    title: 'Hardcoded Cryptographic Keys or Secrets',
    severity: 'critical',
    description: 'Storing sensitive keys, credentials, or tokens inside the source code directly rather than in environment variables.',
    examples: `const JWT_SECRET = 'super_secret_temporary_key_123456';`,
    remediation: `const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('Missing JWT_SECRET env');`
  },
  {
    owasp_id: 'A03:2021',
    category: 'Injection',
    title: 'SQL Injection (SQLi) via Concatenation',
    severity: 'critical',
    description: 'Constructing SQL query strings by directly concatenating user input instead of using parameterized queries or prepared statements.',
    examples: `const query = \`SELECT * FROM users WHERE email = '\${req.body.email}' AND password = '\${req.body.password}'\`;
const [users] = await db.query(query);`,
    remediation: `const query = 'SELECT * FROM users WHERE email = ? AND password = ?';
const [users] = await db.query(query, [req.body.email, req.body.password]);`
  },
  {
    owasp_id: 'A03:2021',
    category: 'Injection',
    title: 'Command Injection',
    severity: 'critical',
    description: 'Passing unsanitized user input directly to system command execution functions like exec, execSync, or spawn.',
    examples: `const { exec } = require('child_process');
exec(\`ping -c 1 \${req.query.host}\`, (err, stdout) => { ... });`,
    remediation: `// Use child_process.execFile or validate inputs strictly
const { execFile } = require('child_process');
if (!/^[a-zA-Z0-9.-]+$/.test(req.query.host)) throw new Error('Invalid host');
execFile('ping', ['-c', '1', req.query.host], (err, stdout) => { ... });`
  },
  {
    owasp_id: 'A03:2021',
    category: 'Injection',
    title: 'Path Traversal',
    severity: 'high',
    description: 'Allowing users to specify paths to files that are read from the filesystem without validation, allowing access to arbitrary files outside of the intended root directory.',
    examples: `const fs = require('fs');
app.get('/download', (req, res) => {
  const file = req.query.file;
  res.send(fs.readFileSync('/var/www/uploads/' + file));
});`,
    remediation: `const path = require('path');
const fs = require('fs');
app.get('/download', (req, res) => {
  const file = path.basename(req.query.file);
  const safePath = path.resolve('/var/www/uploads/', file);
  if (!safePath.startsWith('/var/www/uploads/')) {
    return res.status(403).send('Access Denied');
  }
  res.sendFile(safePath);
});`
  },
  {
    owasp_id: 'A04:2021',
    category: 'Insecure Design',
    title: 'Trusting Client-Side Prices or Quantities',
    severity: 'high',
    description: 'Failing to validate business logic values sent from the client, such as pricing, discounts, or permissions, letting attackers modify request payloads to get items for free or cheap.',
    examples: `app.post('/checkout', async (req, res) => {
  const total = req.body.price * req.body.quantity;
  await chargeUser(req.user, total);
});`,
    remediation: `app.post('/checkout', async (req, res) => {
  const item = await db.getItem(req.body.itemId);
  const total = item.price * req.body.quantity;
  await chargeUser(req.user, total);
});`
  },
  {
    owasp_id: 'A05:2021',
    category: 'Security Misconfiguration',
    title: 'Overly Permissive CORS Headers',
    severity: 'medium',
    description: 'Setting CORS Access-Control-Allow-Origin header to wildcard "*" while returning sensitive credentials or allowing requests from untrusted origins.',
    examples: `app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});`,
    remediation: `app.use(cors({ origin: process.env.ALLOWED_ORIGIN, credentials: true }));`
  },
  {
    owasp_id: 'A05:2021',
    category: 'Security Misconfiguration',
    title: 'Verbose Error Messages Exposing Stack Traces',
    severity: 'medium',
    description: 'Returning raw system errors or full stack traces to the user in HTTP API responses, which leaks framework versions and database details.',
    examples: `app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});`,
    remediation: `app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});`
  },
  {
    owasp_id: 'A06:2021',
    category: 'Vulnerable and Outdated Components',
    title: 'Using Libraries with Known Vulnerabilities',
    severity: 'high',
    description: 'Importing packages with known security issues (e.g. older versions of lodash or express) that are susceptible to execution hijacking.',
    examples: `dependencies: {
  "lodash": "4.17.4"
}`,
    remediation: `dependencies: {
  "lodash": "^4.17.21"
} // Run audit npm audit fix regularly`
  },
  {
    owasp_id: 'A07:2021',
    category: 'Identification and Authentication Failures',
    title: 'Weak Password Requirements',
    severity: 'medium',
    description: 'Permitting users to choose weak or generic passwords, or failing to enforce minimum length and complexity complexity requirements during registration.',
    examples: `if (password.length < 4) {
  return res.status(400).send('Password too short');
}`,
    remediation: `const z = require('zod');
const passwordSchema = z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/);
try { passwordSchema.parse(password); } catch { ... }`
  },
  {
    owasp_id: 'A07:2021',
    category: 'Identification and Authentication Failures',
    title: 'JWT Token Validation Bypass',
    severity: 'critical',
    description: 'Failing to verify signatures, utilizing the "none" signature algorithm parameter, or ignoring expiration dates in JSON Web Tokens.',
    examples: `const jwt = require('jsonwebtoken');
const decoded = jwt.decode(token); // Decodes without verifying signature`,
    remediation: `const jwt = require('jsonwebtoken');
const payload = jwt.verify(token, process.env.JWT_SECRET);`
  },
  {
    owasp_id: 'A08:2021',
    category: 'Software and Data Integrity Failures',
    title: 'Untrusted Deserialization',
    severity: 'critical',
    description: 'Reconstructing objects from data sources without performing type checks or validation, which can lead to remote code execution.',
    examples: `const serialize = require('node-serialize');
const payload = req.cookies.session;
const user = serialize.unserialize(payload); // Exploit payload: {"rce":"_$$ND_FUNC$$_..."}`,
    remediation: `// Use JSON.parse and validate using a schema validation framework (e.g., Zod)
const user = JSON.parse(req.cookies.session);
userSchema.parse(user);`
  },
  {
    owasp_id: 'A09:2021',
    category: 'Security Logging and Monitoring Failures',
    title: 'Lack of Logging for Critical Transactions',
    severity: 'low',
    description: 'Failing to log sensitive operations like administrative actions, login failures, or password changes, preventing audit trails during an incident investigation.',
    examples: `app.post('/api/admin/change-settings', async (req, res) => {
  await db.updateSettings(req.body);
  res.send('Settings updated');
});`,
    remediation: `app.post('/api/admin/change-settings', async (req, res) => {
  await db.updateSettings(req.body);
  logger.warn(\`Admin \${req.user.email} updated settings from IP \${req.ip}\`);
  res.send('Settings updated');
});`
  },
  {
    owasp_id: 'A10:2021',
    category: 'Server-Side Request Forgery',
    title: 'Server-Side Request Forgery (SSRF)',
    severity: 'high',
    description: 'Allowing attackers to pass URLs to the backend that are then requested by the server itself, allowing access to private internal assets (e.g. AWS metadata services).',
    examples: `const axios = require('axios');
app.get('/proxy', async (req, res) => {
  const response = await axios.get(req.query.url);
  res.send(response.data);
});`,
    remediation: `// Validate URL against an allowlist, or block internal IP ranges (127.0.0.1, 10.0.0.0/8, 169.254.169.254)
const { URL } = require('url');
const parsed = new URL(req.query.url);
if (!['api.github.com', 'api.stripe.com'].includes(parsed.hostname)) {
  throw new Error('Forbidden destination');
}
const response = await axios.get(req.query.url);`
  }
];

async function migrate() {
  console.log('🔄 Creating database if not exists...');
  const tempConn = await mysql.createConnection({
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT || '3306'),
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
  });
  await tempConn.query('CREATE DATABASE IF NOT EXISTS `codex_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  await tempConn.end();

  console.log('🔄 Connecting to codex_db...');
  const connection = await pool.getConnection();

  try {
    // 1. Disable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    // 2. Drop obsolete tables if they exist
    const tablesToDrop = [
      'team_invites',
      'team_members',
      'teams',
      'pr_file_diffs',
      'pr_files',
      'pull_requests',
      'github_check_runs',
      'webhook_events',
      'alert_logs',
      'alert_configs',
      'developer_snapshots',
      'score_history',
      'comment_categories',
      'issue_taxonomy',
      'custom_rules'
    ];

    for (const table of tablesToDrop) {
      console.log(`Dropping table if exists: ${table}`);
      await connection.query(`DROP TABLE IF EXISTS \`${table}\`;`);
    }

    // 3. Drop events/procedures/triggers/views if any exist
    console.log('Clearing old triggers, events, views, and procedures...');
    const dropRoutines = [
      'DROP EVENT IF EXISTS evt_weekly_snapshot',
      'DROP EVENT IF EXISTS evt_hourly_alert_check',
      'DROP EVENT IF EXISTS evt_daily_playground_cleanup',
      'DROP PROCEDURE IF EXISTS calculate_developer_score',
      'DROP PROCEDURE IF EXISTS generate_weekly_snapshot',
      'DROP PROCEDURE IF EXISTS flag_repeat_offender',
      'DROP PROCEDURE IF EXISTS get_team_analytics',
      'DROP PROCEDURE IF EXISTS search_reviews',
      'DROP VIEW IF EXISTS v_developer_leaderboard',
      'DROP VIEW IF EXISTS v_repo_health_summary',
      'DROP VIEW IF EXISTS v_developer_trend',
      'DROP VIEW IF EXISTS v_team_weekly_report'
    ];
    for (const query of dropRoutines) {
      try {
        await connection.query(query);
      } catch (e) {
        // Safe to ignore
      }
    }

    // 4. Create base tables using CREATE TABLE IF NOT EXISTS
    console.log('Creating/verifying users table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        name            VARCHAR(100) NOT NULL,
        email           VARCHAR(255) UNIQUE,
        password_hash   VARCHAR(255),
        github_id       VARCHAR(50) UNIQUE,
        github_username VARCHAR(100),
        github_avatar   VARCHAR(500),
        github_token    TEXT,
        current_score   DECIMAL(5,2) DEFAULT 0.00,
        total_reviews   INT DEFAULT 0,
        role            ENUM('developer','admin') DEFAULT 'developer',
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Safe Alterations for users table (if it pre-existed with different columns)
    const [userColumns] = await connection.query('SHOW COLUMNS FROM users') as any[];
    const userColNames = userColumns.map((c: any) => c.Field);
    if (userColNames.includes('avatar_url') && !userColNames.includes('github_avatar')) {
      console.log('Renaming avatar_url to github_avatar in users...');
      await connection.query('ALTER TABLE users CHANGE COLUMN avatar_url github_avatar VARCHAR(500) NULL;');
    }
    if (userColNames.includes('github_access_token') && !userColNames.includes('github_token')) {
      console.log('Renaming github_access_token to github_token in users...');
      await connection.query('ALTER TABLE users CHANGE COLUMN github_access_token github_token TEXT NULL;');
    }

    console.log('Creating/verifying repositories table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS repositories (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        user_id         INT NOT NULL,
        github_repo_id  BIGINT,
        owner           VARCHAR(100) NOT NULL,
        name            VARCHAR(100) NOT NULL,
        full_name       VARCHAR(200) NOT NULL,
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Safe Alterations for repositories table (e.g. if pre-existed and had team_id)
    const [repoColumns] = await connection.query('SHOW COLUMNS FROM repositories') as any[];
    const repoColNames = repoColumns.map((c: any) => c.Field);
    if (repoColNames.includes('team_id')) {
      console.log('Removing team_id and setting up user_id in repositories...');
      try { await connection.query('ALTER TABLE repositories DROP FOREIGN KEY fk_repo_team;'); } catch {}
      try { await connection.query('ALTER TABLE repositories DROP COLUMN team_id;'); } catch {}
    }
    if (repoColNames.includes('url') && !repoColNames.includes('repo_url')) {
      // Just keep column name as is or change it
    }

    console.log('Creating/verifying reviews table...');
    await connection.query(`
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
        rag_context_used BOOLEAN DEFAULT FALSE,
        retrieval_count  INT DEFAULT 0,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE SET NULL,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Creating/verifying review_comments table...');
    await connection.query(`
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
        citation_source VARCHAR(200),
        citation_text   TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
        INDEX idx_review_id (review_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Creating/verifying review_shares table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS review_shares (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        review_id       INT NOT NULL,
        slug            VARCHAR(36) UNIQUE NOT NULL,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at      TIMESTAMP,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Creating/verifying repo_analyses table...');
    await connection.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Creating new Codex 2.0 tables...');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS indexed_repos (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        repo_id           INT NOT NULL,
        user_id           INT NOT NULL,
        status            ENUM('pending','indexing','ready','failed') DEFAULT 'pending',
        chunk_count       INT DEFAULT 0,
        files_processed   INT DEFAULT 0,
        total_files       INT DEFAULT 0,
        embedding_model   VARCHAR(100) DEFAULT 'all-MiniLM-L6-v2',
        chroma_collection VARCHAR(200),
        index_duration_ms INT,
        error_message     TEXT,
        last_indexed_at   TIMESTAMP,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_repo_user (repo_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS rag_retrieval_logs (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        session_type      ENUM('review','chat','refactor'),
        user_id           INT,
        repo_id           INT,
        query_text        TEXT,
        corpora_queried   JSON,
        chunks_retrieved  INT DEFAULT 0,
        retrieval_latency_ms INT,
        top_similarity_score DECIMAL(5,4),
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        user_id           INT NOT NULL,
        repo_id           INT NOT NULL,
        title             VARCHAR(200),
        message_count     INT DEFAULT 0,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
        INDEX idx_user_repo (user_id, repo_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        session_id        INT NOT NULL,
        role              ENUM('user','assistant'),
        content           TEXT NOT NULL,
        retrieved_chunks  JSON,
        retrieval_latency_ms INT,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
        INDEX idx_session_id (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS owasp_rules (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        owasp_id        VARCHAR(20) NOT NULL,
        category        VARCHAR(100) NOT NULL,
        title           VARCHAR(200) NOT NULL,
        severity        VARCHAR(20) NOT NULL,
        description     TEXT NOT NULL,
        examples        TEXT,
        remediation     TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Seed the owasp_rules table
    console.log('Seeding owasp_rules table...');
    await connection.query('DELETE FROM owasp_rules;');
    for (const rule of owaspRulesSeed) {
      await connection.query(`
        INSERT INTO owasp_rules (owasp_id, category, title, severity, description, examples, remediation)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        rule.owasp_id,
        rule.category,
        rule.title,
        rule.severity,
        rule.description,
        rule.examples,
        rule.remediation
      ]);
    }
    console.log('OWASP Top 10 rules seeded successfully!');

    // 7. Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('✅ Database migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    } catch {}
    throw error;
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
