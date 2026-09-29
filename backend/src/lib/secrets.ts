import { readFileSync } from 'node:fs';
import { logger } from './log.js';

/**
 * Loads a secret from a file path. Docker compose mounts secrets under
 * /run/secrets/<name>; we accept the path via the matching `*_FILE`
 * environment variable (DB_PASSWORD_FILE, SANDBOX_RUNNER_TOKEN_FILE, …).
 *
 * If the file is missing AND a fallback env var is set, we return that —
 * this keeps local dev (`npm run dev`) working without compose secrets.
 *
 * Cached for the lifetime of the process; secrets are read once on
 * first use and never refreshed. Compose's secret-rotating requires a
 * container restart, so this matches the deployment model.
 */
const cache = new Map<string, string>();

export function readSecret(path: string, fallbackEnv?: string): string {
  if (cache.has(path)) return cache.get(path)!;

  // Try the file first.
  try {
    const value = readFileSync(path, 'utf8').trim();
    if (value) {
      cache.set(path, value);
      return value;
    }
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') {
      logger.warn('secrets', 'failed to read secret file', { path, error: e.message });
    }
    // Fall through to the fallback env.
  }

  // Fallback to env var for local dev / tests.
  if (fallbackEnv) {
    const value = process.env[fallbackEnv];
    if (value) {
      cache.set(path, value);
      return value;
    }
  }

  throw new Error(`secret not found at ${path}` + (fallbackEnv ? ` and env ${fallbackEnv} is empty` : ''));
}