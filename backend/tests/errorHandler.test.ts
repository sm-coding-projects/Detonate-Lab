import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../src/middleware/errorHandler.js';

interface StubRes {
  statusCode: number;
  body: unknown;
  status: (n: number) => StubRes;
  json: (b: unknown) => StubRes;
}

function makeRes(): Response {
  const r: StubRes = {
    statusCode: 0,
    body: undefined,
    status(n) { this.statusCode = n; return this; },
    json(b) { this.body = b; return this; },
  };
  return r as unknown as Response;
}

const realStderrWrite = process.stderr.write.bind(process.stderr);
const realStdoutWrite = process.stdout.write.bind(process.stdout);
before(() => {
  process.stderr.write = (() => true) as typeof process.stderr.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
});
after(() => {
  process.stderr.write = realStderrWrite;
  process.stdout.write = realStdoutWrite;
});

describe('errorHandler — leak-tight responses', () => {
  it('curated message for 400 (does not echo raw error text)', () => {
    const res = makeRes() as unknown as Response;
    const req = {} as Request;
    const next = (() => undefined) as NextFunction;
    const err = Object.assign(new Error('database connection refused at /var/run/postgres/.s.PGSQL.5432'), {
      status: 400,
      code: 'validation_error',
    });
    errorHandler(err, req, res, next);
    const stub = res as unknown as StubRes;
    assert.equal(stub.statusCode, 400);
    const body = stub.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'validation_error');
    assert.equal(body.error.message, 'Bad request');
    assert.ok(!body.error.message.includes('postgres'), 'must not echo connection-string details');
  });

  it('curated message for 413', () => {
    const res = makeRes() as unknown as Response;
    const req = {} as Request;
    const next = (() => undefined) as NextFunction;
    errorHandler(Object.assign(new Error('whatever'), { status: 413 }), req, res, next);
    const stub = res as unknown as StubRes;
    assert.equal(stub.statusCode, 413);
    assert.equal((stub.body as { error: { message: string } }).error.message, 'Payload too large');
  });

  it('curated message for 500 — never echoes raw error text', () => {
    const res = makeRes() as unknown as Response;
    const req = {} as Request;
    const next = (() => undefined) as NextFunction;
    const err = Object.assign(new Error('SQLSTATE 08006 ECONNREFUSED 127.0.0.1:5432 stack at /srv/api/db/pool.ts:42'), {});
    errorHandler(err, req, res, next);
    const stub = res as unknown as StubRes;
    assert.equal(stub.statusCode, 500);
    const body = stub.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'internal_error');
    assert.equal(body.error.message, 'Internal server error');
    assert.ok(!body.error.message.includes('SQLSTATE'), 'must not echo upstream error');
    assert.ok(!body.error.message.includes('127.0.0.1'), 'must not echo address');
  });

  it('preserves the explicit code field when set', () => {
    const res = makeRes() as unknown as Response;
    const req = {} as Request;
    const next = (() => undefined) as NextFunction;
    errorHandler(Object.assign(new Error('x'), { status: 401, code: 'auth_required' }), req, res, next);
    const stub = res as unknown as StubRes;
    assert.equal((stub.body as { error: { code: string } }).error.code, 'auth_required');
  });
});
