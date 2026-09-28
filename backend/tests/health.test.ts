import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/test-app.js';

describe('GET /health', () => {
  it('returns 200 with service identity', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'chatapp-api' });
  });
});
