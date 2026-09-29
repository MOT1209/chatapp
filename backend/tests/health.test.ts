import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers/harness.js';

describe('GET /health', () => {
  it('returns 200 with service identity', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'chatapp-api' });
  });

  it('returns the contract error envelope for an unknown route', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });
});
