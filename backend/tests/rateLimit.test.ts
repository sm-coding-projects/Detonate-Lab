import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { rateLimiter } from '../src/middleware/rateLimit.js';

interface StubRes {
  statusCode: number;
  body?: unknown;
  headers: Record<string, string>;
  status: (n: number) => StubRes;
  json: (b: unknown) => StubRes;
  setHeader: (k: string, v: string) => void;
}

function makeRes(): Response {
  const r: StubRes = {
    statusCode: 0,
    headers: {},
    status(n) { this.statusCode = n; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
  return r as unknown as Response;
}

function makeReq(): Request {
  return { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
}

describe('rateLimiter', () => {
  it('allows up to `max` requests within a window, then 429s', () => {
    const limit = rateLimiter({ windowMs: 1000, max: 3, name: 'test' });
    const req = makeReq();
    for (let i = 0; i < 3; i++) {
      let nextCalled = false;
      limit(req, makeRes(), () => { nextCalled = true; });
      assert.equal(nextCalled, true, `request ${i + 1} should pass`);
    }
    const res = makeRes() as unknown as Response;
    let nextCalled = false;
    limit(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, '4th request must be blocked');
    const stub = res as unknown as StubRes;
    assert.equal(stub.statusCode, 429);
    assert.match(stub.headers['Retry-After'] || '', /^\d+$/);
  });

  it('rejects when the bucket is empty with a curated error body', () => {
    const limit = rateLimiter({ windowMs: 1000, max: 1, name: 'test2' });
    const req = makeReq();
    limit(req, makeRes(), () => undefined);
    const res = makeRes() as unknown as Response;
    limit(req, res, () => undefined);
    const stub = res as unknown as StubRes;
    assert.equal(stub.statusCode, 429);
    const body = stub.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'rate_limited');
    assert.ok(body.error.message.length > 0);
  });
});
