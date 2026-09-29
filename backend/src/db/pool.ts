import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../lib/log.js';
import { readSecret } from '../lib/secrets.js';

/**
 * Resolve the database password. Compose mounts `db_password` as a
 * secret at /run/secrets/db_password; we read it from disk and inject
 * the password into the URL when DB_PASSWORD_FILE is set. When the file
 * is missing, we fall back to whatever DATABASE_URL already encodes
 * (which is `detonate:detonate@...` for local dev).
 */
function resolveDatabaseUrl(): string {
  const url = config.databaseUrl;
  const pwFile = process.env.DB_PASSWORD_FILE;
  if (!pwFile) return url;

  let password: string;
  try {
    password = readSecret(pwFile, 'DB_PASSWORD');
  } catch (err) {
    logger.warn('db', 'DB_PASSWORD_FILE present but unreadable; using DATABASE_URL as-is', {
      err: (err as Error).message,
    });
    return url;
  }

  try {
    const u = new URL(url);
    u.password = password;
    return u.toString();
  } catch {
    // URL itself is malformed — fall back to a string replace on the
    // conventional `user:password@host` slot.
    return url.replace(/\/\/([^:@/]+):[^@]*@/, (_, user) => `//${user}:${encodeURIComponent(password)}@`);
  }
}

export const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(),
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
