import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../lib/log.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // Log and keep the process alive; individual queries surface their own errors.
  logger.error('db', 'idle client error', { err: err.message });
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never);
}

/** Wait for Postgres to accept connections (compose ordering can race). */
export async function waitForDb(attempts = 30, delayMs = 1000): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.info('db', `not ready (attempt ${i}/${attempts})`, { err: msg });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Database did not become ready in time');
}
