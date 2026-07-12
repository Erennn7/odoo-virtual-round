import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
});

/** Run a parameterized query against the pool. */
export const query = (text, params) => pool.query(text, params);

/**
 * Run `fn(client)` inside a transaction. Commits on success,
 * rolls back on any thrown error. All multi-step business
 * operations must go through this to guarantee integrity.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
