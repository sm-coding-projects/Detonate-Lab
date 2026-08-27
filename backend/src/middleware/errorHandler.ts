import type { Request, Response, NextFunction } from 'express';

export interface HttpError extends Error {
  status?: number;
  code?: string;
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Resource not found' } });
}

// Express error-handling middleware must keep its 4-arg signature.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: HttpError, _req: Request, res: Response, _next: NextFunction): void {
  const status = typeof err.status === 'number' ? err.status : 500;
  const code = err.code || (status === 500 ? 'internal_error' : 'error');
  if (status >= 500) console.error('[error]', err);
  // Never leak internals on 500s.
  const message = status >= 500 ? 'Internal server error' : err.message || 'Request failed';
  res.status(status).json({ error: { code, message } });
}
