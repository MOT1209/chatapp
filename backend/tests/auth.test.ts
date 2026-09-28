import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';
import { prisma } from '../src/lib/prisma.js';

let app: Express;

beforeAll(() => {
  app = buildTestApp();
});

afterEach(async () => {
  await resetDb();
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns tokens + user with email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'Ahmad',
      email: 'Ahmad@Example.com',
      password: 'correct-horse-battery',
      displayName: 'Ahmad',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      username: 'ahmad', // lowercased
      email: 'ahmad@example.com', // lowercased
      displayName: 'Ahmad',
      avatarUrl: null,
      isOnline: false,
      lastSeenAt: null,
    });
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('never stores the raw password', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'secure',
      email: 'secure@example.com',
      password: 'correct-horse-battery',
      displayName: 'Secure',
    });
    const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'secure' } });
    expect(stored.passwordHash).not.toBe('correct-horse-battery');
    expect(stored.passwordHash.startsWith('$2')).toBe(true); // bcrypt hash prefix
  });

  it('rejects a duplicate username with CONFLICT', async () => {
    await registerUser(app, { username: 'taken', email: 'a@example.com' });
    const res = await request(app).post('/api/auth/register').send({
      username: 'taken',
      email: 'b@example.com',
      password: 'correct-horse-battery',
      displayName: 'Someone',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    await registerUser(app, { username: 'first', email: 'dupe@example.com' });
    const res = await request(app).post('/api/auth/register').send({
      username: 'second',
      email: 'dupe@example.com',
      password: 'correct-horse-battery',
      displayName: 'Someone',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects an invalid body with VALIDATION_ERROR and field detail', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'ab', // too short
      email: 'not-an-email',
      password: 'short',
      displayName: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toEqual(
      expect.objectContaining({
        username: expect.any(String),
        email: expect.any(String),
        password: expect.any(String),
        displayName: expect.any(String),
      }),
    );
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with username', async () => {
    await registerUser(app, { username: 'loginuser', email: 'login@example.com', password: 'correct-horse-battery' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'loginuser', password: 'correct-horse-battery' });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('loginuser');
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('logs in with email', async () => {
    await registerUser(app, { username: 'emailer', email: 'emailer@example.com', password: 'correct-horse-battery' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'emailer@example.com', password: 'correct-horse-battery' });
    expect(res.status).toBe(200);
  });

  it('rejects an unknown identifier with INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nobody', password: 'whatever12' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a wrong password with the same INVALID_CREDENTIALS code (no enumeration)', async () => {
    await registerUser(app, { username: 'wrongpw', email: 'wrongpw@example.com', password: 'correct-horse-battery' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'wrongpw', password: 'not-the-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('Authentication middleware', () => {
  it('rejects a protected route with no token as UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a garbage token as UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/users/me').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('accepts a valid access token', async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new token pair and rotates the refresh token', async () => {
    const { refreshToken } = await registerUser(app);
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken).not.toBe(refreshToken);

    // The old refresh token is now dead.
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an unknown refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'nope' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes sessions so the refresh token stops working', async () => {
    const { accessToken, refreshToken } = await registerUser(app);

    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(204);

    const refreshAttempt = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshAttempt.status).toBe(401);
  });

  it('returns 204 even with no token, so it never blocks client-side logout', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('always returns 202, whether or not the email exists', async () => {
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(known.status).toBe(202);
    expect(known.body).toEqual({});

    await registerUser(app, { email: 'real@example.com' });
    const real = await request(app).post('/api/auth/forgot-password').send({ email: 'real@example.com' });
    expect(real.status).toBe(202);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('rejects an invalid token with VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'new-correct-horse' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
