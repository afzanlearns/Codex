import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  database:           process.env.DB_NAME     || 'codex_db',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:    parseInt(process.env.DB_POOL_MAX || '20'),
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0,
  timezone:           '+00:00',
  charset:            'utf8mb4',
  decimalNumbers:     true,
});

export async function testConnection(): Promise<void> {
  const conn = await pool.getConnection();
  console.log('✅ MySQL connected successfully');
  conn.release();
}

export default pool;
