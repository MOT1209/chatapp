import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/test-app.js';
import { prisma } from '../src/lib/prisma.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /health', () => {
  it('returns 200 with service identity', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'chatapp-api' });
  });

  it('exposes Retry-After to allowed browser origins so a 429 can say how long to wait', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-expose-headers']).toBe('Retry-After');
  });

  it('stays a cheap liveness check: it never touches the database', async () => {
    // Repair brief §10: /health must not perform expensive DB queries.
    const app = buildTestApp();
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('database must not be queried'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('GET /ready', () => {
  it('returns 200 with a database-up check when the DB is reachable', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      service: 'chatapp-api',
      checks: { database: 'up' },
    });
  });

  it('returns 503 with a database-down check when the DB is unreachable', async () => {
    // Repair brief §10: process alive but database unavailable → 503, and the
    // response must not leak the connection string or error text.
    const app = buildTestApp();
    vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('P1001: can not reach database server postgres://…'));
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'degraded',
      service: 'chatapp-api',
      checks: { database: 'down' },
    });
    expect(JSON.stringify(res.body)).not.toContain('P1001');
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
  });
});
