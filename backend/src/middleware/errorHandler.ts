import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/log.js';

export interface HttpError extends Error {
  status?: number;
  code?: string;
}

/**
 * Map a known HTTP status to a safe, generic client-facing message. We never
 * forward the raw `err.message` to the response body — for 4xx we use the
 * ValidationError (and similar) class messages, which are author-curated, and
 * for everything else we fall back to a static string. Internal details only
 * ever reach the logger.
 */
const CLIENT_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  415: 'Unsupported media type',
  422: 'Unprocessable entity',
  429: 'Too many requests',
};

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Resource not found' } });
}

// Express error-handling middleware must keep its 4-arg signature.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: HttpError, _req: Request, res: Response, _next: NextFunction): void {
  const status = typeof err.status === 'number' ? err.status : 500;
  const code = err.code || (status === 500 ? 'internal_error' : 'error');
  // Curated client messages never echo the upstream error text.
  // ValidationError (and other author-supplied messages) are still safe to
  // pass through because the codebase only produces clean strings on 4xx; we
  // refuse anything else to avoid leaking driver/connection strings.
  const curated = CLIENT_MESSAGES[status];
  const message = curated ?? (status >= 500 ? 'Internal server error' : (err.message || 'Request failed'));

  if (status >= 500) {
    logger.error('http', 'unhandled error', { status, err: err.message, stack: err.stack });
  } else {
    logger.warn('http', 'request error', { status, code, err: err.message });
  }
  res.status(status).json({ error: { code, message } });
}
