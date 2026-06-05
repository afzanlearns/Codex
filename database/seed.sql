-- ============================================================
-- CODEX 2.0 — OWASP Top 10 Corpus Seed Data
-- ============================================================

USE codex_db;

DELETE FROM owasp_rules;

INSERT INTO owasp_rules (owasp_id, category, title, severity, description, examples, remediation) VALUES
('A01:2021', 'Broken Access Control', 'Insecure Direct Object Reference (IDOR)', 'high',
 'Occurs when a developer exposes a reference to an internal implementation object, such as a file or database key, in a way that allows an attacker to manipulate the reference to access unauthorized data.',
 '// Vulnerable Node/Express endpoint\napp.get(''/api/user/:id'', async (req, res) => {\n  const user = await db.query(''SELECT * FROM users WHERE id = ?'', [req.params.id]);\n  res.json(user);\n});',
 '// Secure version checking ownership\napp.get(''/api/user/:id'', authenticate, async (req, res) => {\n  if (req.user.id !== parseInt(req.params.id) && req.user.role !== ''admin'') {\n    return res.status(403).json({ error: ''Unauthorized'' });\n  }\n  const user = await db.query(''SELECT * FROM users WHERE id = ?'', [req.params.id]);\n  res.json(user);\n});'),

('A01:2021', 'Broken Access Control', 'Missing Function Level Access Control', 'high',
 'Failure to restrict access to sensitive endpoints or admin functionality, allowing standard users to execute actions reserved for administrators.',
 'app.post(''/api/admin/delete-user'', async (req, res) => {\n  await db.query(''DELETE FROM users WHERE id = ?'', [req.body.userId]);\n  res.json({ success: true });\n});',
 'app.post(''/api/admin/delete-user'', authenticate, requireRole(''admin''), async (req, res) => {\n  await db.query(''DELETE FROM users WHERE id = ?'', [req.body.userId]);\n  res.json({ success: true });\n});'),

('A02:2021', 'Cryptographic Failures', 'Use of Weak Hash Functions (MD5/SHA1)', 'high',
 'Using weak, legacy cryptographic algorithms like MD5 or SHA1 for password hashing or data integrity checks, exposing the system to collisions or dictionary attacks.',
 'const md5 = require(''md5'');\nconst hash = md5(password);',
 'const bcrypt = require(''bcryptjs'');\nconst hash = await bcrypt.hash(password, 12);'),

('A02:2021', 'Cryptographic Failures', 'Hardcoded Cryptographic Keys or Secrets', 'critical',
 'Storing sensitive keys, credentials, or tokens inside the source code directly rather than in environment variables.',
 'const JWT_SECRET = ''super_secret_temporary_key_123456'';',
 'const JWT_SECRET = process.env.JWT_SECRET;\nif (!JWT_SECRET) throw new Error(''Missing JWT_SECRET env'');'),

('A03:2021', 'Injection', 'SQL Injection (SQLi) via Concatenation', 'critical',
 'Constructing SQL query strings by directly concatenating user input instead of using parameterized queries or prepared statements.',
 'const query = `SELECT * FROM users WHERE email = ''${req.body.email}'' AND password = ''${req.body.password}''`;\nconst [users] = await db.query(query);',
 'const query = ''SELECT * FROM users WHERE email = ? AND password = ?'';\nconst [users] = await db.query(query, [req.body.email, req.body.password]);'),

('A03:2021', 'Injection', 'Command Injection', 'critical',
 'Passing unsanitized user input directly to system command execution functions like exec, execSync, or spawn.',
 'const { exec } = require(''child_process'');\nexec(`ping -c 1 ${req.query.host}`, (err, stdout) => { ... });',
 '// Use child_process.execFile or validate inputs strictly\nconst { execFile } = require(''child_process'');\nif (!/^[a-zA-Z0-9.-]+$/.test(req.query.host)) throw new Error(''Invalid host'');\nexecFile(''ping'', [''-c'', ''1'', req.query.host], (err, stdout) => { ... });'),

('A03:2021', 'Injection', 'Path Traversal', 'high',
 'Allowing users to specify paths to files that are read from the filesystem without validation, allowing access to arbitrary files outside of the intended root directory.',
 'const fs = require(''fs'');\napp.get('/download', (req, res) => {\n  const file = req.query.file;\n  res.send(fs.readFileSync(''/var/www/uploads/'' + file));\n});',
 'const path = require(''path'');\nconst fs = require(''fs'');\napp.get(''/download'', (req, res) => {\n  const file = path.basename(req.query.file);\n  const safePath = path.resolve(''/var/www/uploads/'', file);\n  if (!safePath.startsWith(''/var/www/uploads/'')) {\n    return res.status(403).send(''Access Denied'');\n  }\n  res.sendFile(safePath);\n});'),

('A04:2021', 'Insecure Design', 'Trusting Client-Side Prices or Quantities', 'high',
 'Failing to validate business logic values sent from the client, such as pricing, discounts, or permissions, letting attackers modify request payloads to get items for free or cheap.',
 'app.post(''/checkout'', async (req, res) => {\n  const total = req.body.price * req.body.quantity;\n  await chargeUser(req.user, total);\n});',
 'app.post(''/checkout'', async (req, res) => {\n  const item = await db.getItem(req.body.itemId);\n  const total = item.price * req.body.quantity;\n  await chargeUser(req.user, total);\n});'),

('A05:2021', 'Security Misconfiguration', 'Overly Permissive CORS Headers', 'medium',
 'Setting CORS Access-Control-Allow-Origin header to wildcard "*" while returning sensitive credentials or allowing requests from untrusted origins.',
 'app.use((req, res, next) => {\n  res.setHeader(''Access-Control-Allow-Origin'', ''*'');\n  res.setHeader(''Access-Control-Allow-Credentials'', ''true'');\n  next();\n});',
 'app.use(cors({ origin: process.env.ALLOWED_ORIGIN, credentials: true }));'),

('A05:2021', 'Security Misconfiguration', 'Verbose Error Messages Exposing Stack Traces', 'medium',
 'Returning raw system errors or full stack traces to the user in HTTP API responses, which leaks framework versions and database details.',
 'app.use((err, req, res, next) => {\n  res.status(500).json({ error: err.message, stack: err.stack });\n});',
 'app.use((err, req, res, next) => {\n  console.error(err);\n  res.status(500).json({ error: ''Internal Server Error'' });\n});'),

('A06:2021', 'Vulnerable and Outdated Components', 'Using Libraries with Known Vulnerabilities', 'high',
 'Importing packages with known security issues (e.g. log4j, older versions of express, lodash, or serialize-javascript) that are susceptible to execution hijacking.',
 'dependencies: {\n  "lodash": "4.17.4"\n}',
 'dependencies: {\n  "lodash": "^4.17.21"\n} // Run audit npm audit fix regularly'),

('A07:2021', 'Identification and Authentication Failures', 'Weak Password Requirements', 'medium',
 'Permitting users to choose weak or generic passwords, or failing to enforce minimum length and character complexity requirements during registration.',
 'if (password.length < 4) {\n  return res.status(400).send(''Password too short'');\n}',
 'const z = require(''zod'');\nconst passwordSchema = z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/);\ntry { passwordSchema.parse(password); } catch { ... }'),

('A07:2021', 'Identification and Authentication Failures', 'JWT Token Validation Bypass', 'critical',
 'Failing to verify signatures, utilizing the "none" signature algorithm parameter, or ignoring expiration dates in JSON Web Tokens.',
 'const jwt = require(''jsonwebtoken'');\nconst decoded = jwt.decode(token); // Decodes without verifying signature',
 'const jwt = require(''jsonwebtoken'');\nconst payload = jwt.verify(token, process.env.JWT_SECRET);'),

('A08:2021', 'Software and Data Integrity Failures', 'Untrusted Deserialization', 'critical',
 'Reconstructing objects from data sources without performing type checks or validation, which can lead to remote code execution.',
 'const serialize = require(''node-serialize'');\nconst payload = req.cookies.session;\nconst user = serialize.unserialize(payload); // Exploit payload: {"rce":"_$$ND_FUNC$$_..."}',
 '// Use JSON.parse and validate using a schemas framework (e.g., Zod)\nconst user = JSON.parse(req.cookies.session);\nuserSchema.parse(user);'),

('A09:2021', 'Security Logging and Monitoring Failures', 'Lack of Logging for Critical Transactions', 'low',
 'Failing to log sensitive operations like administrative actions, login failures, or password changes, preventing audit trails during an incident investigation.',
 'app.post(''/api/admin/change-settings'', async (req, res) => {\n  await db.updateSettings(req.body);\n  res.send(''Settings updated'');\n});',
 'app.post(''/api/admin/change-settings'', async (req, res) => {\n  await db.updateSettings(req.body);\n  logger.warn(`Admin ${req.user.email} updated settings from IP ${req.ip}`);\n  res.send(''Settings updated'');\n});'),

('A10:2021', 'Server-Side Request Forgery', 'Server-Side Request Forgery (SSRF)', 'high',
 'Allowing attackers to pass URLs to the backend that are then requested by the server itself, allowing access to private internal assets (e.g., localhost endpoints, AWS metadata services).',
 'const axios = require(''axios'');\napp.get(''/proxy'', async (req, res) => {\n  const response = await axios.get(req.query.url);\n  res.send(response.data);\n});',
 '// Validate URL against an allowlist, or block internal IP ranges (127.0.0.1, 10.0.0.0/8, 169.254.169.254)\nconst { URL } = require(''url'');\nconst parsed = new URL(req.query.url);\nif (![''api.github.com'', ''api.stripe.com''].includes(parsed.hostname)) {\n  throw new Error(''Forbidden destination'');\n}\nconst response = await axios.get(req.query.url);');
