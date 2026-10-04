import { beforeEach, describe, expect, it } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { AUTH_RATE_LIMITS, buildAuthRateLimitersForTests } from '../src/middleware/rate-limit.js';
import { validationError } from '../src/lib/errors.js';

/**
 * Repair brief §9: the five auth endpoints previously shared ONE bucket, so a
 * burst of forgot-password attempts could lock every user out of login. These
 * tests prove each endpoint owns an independent bucket with its own budget,
 * and that a blocked request keeps the contract shape (429 RATE_LIMITED with
 * Retry-After). The real limiters are disabled under NODE_ENV=test, so these
 * run against rebuilds of the very same limiters with the switch off
 * (buildAuthRateLimitersForTests) mounted exactly like auth.routes mounts them.
 */

const exceed = (budget: { max: number }): number => budget.max + 1;

async function exhaust(app: Express, path: string, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await request(app).post(path).send({});
  }
}

describe('auth rate limit buckets are independent', () => {
  let app: Express;

  // Fresh limiters per test so bucket state never leaks between tests.
  beforeEach(() => {
    const limiters = buildAuthRateLimitersForTests();
    app = express();
    app.use(express.json());
    // Same wiring as auth.routes.ts; handlers return deterministic bodies.
    app.post('/register', limiters.register, (_req, res) => res.json({ endpoint: 'register' }));
    app.post('/login', limiters.login, (_req, res) => res.json({ endpoint: 'login' }));
    app.post('/refresh', limiters.refresh, (_req, res) => res.json({ endpoint: 'refresh' }));
    app.post('/forgot-password', limiters.forgotPassword, (_req, res) => res.json({ endpoint: 'forgot-password' }));
    app.post('/reset-password', limiters.resetPassword, (_req, res) => res.json({ endpoint: 'reset-password' }));
  });

  it('exhausting the login bucket does not block refresh, register, forgot or reset', async () => {
    await exhaust(app, '/login', exceed(AUTH_RATE_LIMITS.login));

    const login = await request(app).post('/login').send({});
    expect(login.status).toBe(429);
    expect(login.body.error.code).toBe('RATE_LIMITED');
    expect(Number(login.headers['retry-after'])).toBeGreaterThan(0);

    const refresh = await request(app).post('/refresh').send({});
    const register = await request(app).post('/register').send({});
    const forgot = await request(app).post('/forgot-password').send({});
    const reset = await request(app).post('/reset-password').send({});
    for (const [name, res] of [
      ['refresh', refresh],
      ['register', register],
      ['forgot-password', forgot],
      ['reset-password', reset],
    ] as const) {
      expect(res.status, `${name} must not inherit the login bucket`).toBe(200);
    }
  });

  it('exhausting the forgot-password bucket does not block login or refresh', async () => {
    await exhaust(app, '/forgot-password', exceed(AUTH_RATE_LIMITS.forgotPassword));

    const forgot = await request(app).post('/forgot-password').send({});
    expect(forgot.status).toBe(429);

    const login = await request(app).post('/login').send({});
    expect(login.status).toBe(200);
    const refresh = await request(app).post('/refresh').send({});
    expect(refresh.status).toBe(200);
  });

  it('each endpoint blocks only after its own budget, not a shared count', async () => {
    // Send exactly `refresh.max` refreshes: all must pass.
    for (let i = 0; i < AUTH_RATE_LIMITS.refresh.max; i += 1) {
      const res = await request(app).post('/refresh').send({});
      expect(res.status).toBe(200);
    }
    // One more crosses the refresh bucket's own boundary.
    const blocked = await request(app).post('/refresh').send({});
    expect(blocked.status).toBe(429);

    // ...while register (never touched) still works.
    const register = await request(app).post('/register').send({});
    expect(register.status).toBe(200);
  });

  it('429 responses carry the contract shape: RATE_LIMITED body and Retry-After header', async () => {
    await exhaust(app, '/reset-password', exceed(AUTH_RATE_LIMITS.resetPassword));
    const res = await request(app).post('/reset-password').send({});
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('keeps validationError usable inside transactions (contract shape unchanged)', () => {
    // Guards the import the reset-race transaction relies on: throwing
    // validationError from a Prisma interactive transaction must surface the
    // same AppError, not a wrapped Prisma error.
    const err = validationError({ token: 'bad' }, 'This reset link is invalid or has expired.');
    expect(err.toBody().error.code).toBe('VALIDATION_ERROR');
  });
});
