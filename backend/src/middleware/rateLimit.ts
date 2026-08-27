import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  tokens: number;
  updated: number;
}

/**
 * Lightweight in-memory token-bucket limiter keyed by client IP. Adequate for a
 * single-instance deployment; a multi-replica setup would back this with Redis.
 */
export function rateLimiter(opts: { windowMs: number; max: number; name: string }) {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = opts.max / opts.windowMs;

  // Periodically evict idle buckets to bound memory.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now - b.updated > opts.windowMs * 2) buckets.delete(k);
    }
  }, opts.windowMs);
  sweep.unref?.();

  return function limit(req: Request, res: Response, next: NextFunction): void {
    const key = clientIp(req);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) {
      b = { tokens: opts.max, updated: now };
      buckets.set(key, b);
    }
    b.tokens = Math.min(opts.max, b.tokens + (now - b.updated) * refillPerMs);
    b.updated = now;

    if (b.tokens < 1) {
      const retry = Math.ceil((1 - b.tokens) / refillPerMs / 1000);
      res.setHeader('Retry-After', String(retry));
      res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests, slow down.' } });
      return;
    }
    b.tokens -= 1;
    next();
  };
}

function clientIp(req: Request): string {
  // express `trust proxy` makes req.ip reflect X-Forwarded-For when enabled.
  return req.ip || req.socket.remoteAddress || 'unknown';
}
