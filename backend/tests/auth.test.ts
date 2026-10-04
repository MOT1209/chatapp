import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';
import { prisma } from '../src/lib/prisma.js';
import * as authService from '../src/services/auth.service.js';
import * as emailService from '../src/services/email.service.js';

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

describe('password length is measured in bytes (bcrypt truncates at 72 bytes)', () => {
  it('rejects a register password over 72 bytes even when it is under 72 characters', async () => {
    // 40 Arabic letters = 40 characters but 80 bytes: bcrypt would silently ignore the tail.
    const res = await request(app).post('/api/auth/register').send({
      username: 'bytecheck',
      email: 'bytecheck@example.com',
      password: 'ش'.repeat(40),
      displayName: 'Byte Check',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.password).toMatch(/72 bytes/);
  });

  it('accepts a password of exactly 72 bytes', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'bytecheck2',
      email: 'bytecheck2@example.com',
      password: 'ش'.repeat(36), // 72 bytes
      displayName: 'Byte Check',
    });
    expect(res.status).toBe(201);
  });

  it('applies the same rule to reset-password', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'whatever', newPassword: 'ش'.repeat(40) });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.newPassword).toMatch(/72 bytes/);
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

  it('lets only one of several concurrent refreshes with the same token succeed', async () => {
    const { refreshToken } = await registerUser(app, { username: 'refreshrace' });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/auth/refresh').send({ refreshToken })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('revokes every session when a rotated-out refresh token is replayed', async () => {
    const { refreshToken } = await registerUser(app, { username: 'replayed' });
    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(rotated.status).toBe(200);

    // Replaying the old token is treated as theft: the legitimately rotated token dies too.
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
    const afterReplay = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken as string });
    expect(afterReplay.status).toBe(401);
  });

  it('rejects a refresh token whose session has expired', async () => {
    const { refreshToken } = await registerUser(app, { username: 'expiredsession' });
    // The session exists and is unrevoked — only its expiry is in the past.
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
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

  it('revokes every session, not just the one whose access token was used', async () => {
    const first = await registerUser(app, { username: 'multidevice', password: 'correct-horse-battery' });
    // A second login is a second "device": its own session, its own refresh token.
    const second = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'multidevice', password: 'correct-horse-battery' });
    expect(second.status).toBe(200);

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${first.accessToken}`);
    expect(logoutRes.status).toBe(204);

    const refreshFirst = await request(app).post('/api/auth/refresh').send({ refreshToken: first.refreshToken });
    const refreshSecond = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: second.body.refreshToken as string });
    expect(refreshFirst.status).toBe(401);
    expect(refreshSecond.status).toBe(401);
  });

  // Access tokens live 15 minutes, so a user logging out after a pause has only an
  // expired one. Without the refresh token in the body, nothing identifies them.
  it('revokes the session when the access token is expired but the refresh token is sent', async () => {
    const { user, refreshToken } = await registerUser(app);
    const expired = jwt.sign({ sub: user.id }, 'test-access-secret', { expiresIn: -10 });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${expired}`)
      .send({ refreshToken });
    expect(res.status).toBe(204);

    const refreshAttempt = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshAttempt.status).toBe(401);
  });

  it('revokes every session of the owner when only a refresh token is sent', async () => {
    const first = await registerUser(app, { username: 'refreshonly', password: 'correct-horse-battery' });
    const second = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'refreshonly', password: 'correct-horse-battery' });

    const res = await request(app).post('/api/auth/logout').send({ refreshToken: first.refreshToken });
    expect(res.status).toBe(204);

    const a = await request(app).post('/api/auth/refresh').send({ refreshToken: first.refreshToken });
    const b = await request(app).post('/api/auth/refresh').send({ refreshToken: second.body.refreshToken as string });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
  });

  it('still returns 204 for an unknown or malformed refresh token, and touches no one else', async () => {
    const bystander = await registerUser(app);

    const unknown = await request(app).post('/api/auth/logout').send({ refreshToken: 'not-a-real-token' });
    const malformed = await request(app).post('/api/auth/logout').send({ refreshToken: 12345 });
    expect(unknown.status).toBe(204);
    expect(malformed.status).toBe(204);

    const stillValid = await request(app).post('/api/auth/refresh').send({ refreshToken: bystander.refreshToken });
    expect(stillValid.status).toBe(200);
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

  it('never logs the raw reset token in the running environment (test, here)', async () => {
    await registerUser(app, { email: 'quiet@example.com' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'quiet@example.com' });
      expect(res.status).toBe(202);
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('the HTTP response never contains a token field, regardless of environment', async () => {
    await registerUser(app, { email: 'noleak@example.com' });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'noleak@example.com' });
    expect(res.body).toEqual({});
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });
});

describe('POST /api/auth/forgot-password — token supersession', () => {
  it('invalidates an earlier unused reset token when a new one is requested', async () => {
    await registerUser(app, { email: 'twice@example.com' });
    const first = await authService.requestPasswordReset('twice@example.com');
    const second = await authService.requestPasswordReset('twice@example.com');
    if (!first || !second) {
      throw new Error('expected reset tokens outside production');
    }

    const stale = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: first.resetToken, newPassword: 'brand-new-password' });
    expect(stale.status).toBe(400);

    const fresh = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: second.resetToken, newPassword: 'brand-new-password' });
    expect(fresh.status).toBe(204);
  });
});

describe('POST /api/auth/forgot-password — email delivery', () => {
  /**
   * Delivery itself (SMTP transport, cooldown, failure handling) is pinned in
   * tests/password-reset-mail.test.ts. These tests pin the *seam*: the service
   * hands the freshly minted token to the email service exactly once, for
   * registered addresses only.
   */
  it('hands the freshly created token to the email service for the registered address', async () => {
    await registerUser(app, { email: 'mailme@example.com' });
    const sendSpy = vi.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue(true);

    const result = await authService.requestPasswordReset('mailme@example.com');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const call = sendSpy.mock.calls[0]![0];
    expect(call.to).toBe('mailme@example.com');
    // The emailed token is exactly the one the caller can later redeem.
    expect(call.resetToken).toBe(result?.resetToken);
  });

  it('sends nothing for an unknown address, and never throws (no enumeration)', async () => {
    const sendSpy = vi.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue(true);
    await expect(authService.requestPasswordReset('ghost@example.com')).resolves.toBeUndefined();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('still resolves when the email service reports a failure — a bounce is not a 500', async () => {
    await registerUser(app, { email: 'flaky@example.com' });
    vi.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue(false);

    // email.service swallows provider failures and returns false; the reset flow
    // must keep answering identically either way (contract §3.1/§6.6).
    await expect(authService.requestPasswordReset('flaky@example.com')).resolves.toBeDefined();
  });
});

describe('canExposeRawResetToken', () => {
  it('is true for development and test, false for production', () => {
    expect(authService.canExposeRawResetToken('development')).toBe(true);
    expect(authService.canExposeRawResetToken('test')).toBe(true);
    expect(authService.canExposeRawResetToken('production')).toBe(false);
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

  it('resets the password with a valid token and invalidates every existing session', async () => {
    const registered = await registerUser(app, {
      username: 'resetme',
      email: 'resetme@example.com',
      password: 'correct-horse-battery',
    });

    const result = await authService.requestPasswordReset('resetme@example.com');
    expect(result?.resetToken).toBeTruthy();

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: result!.resetToken, newPassword: 'new-correct-horse' });
    expect(resetRes.status).toBe(204);

    // The session from before the reset is dead.
    const refreshAttempt = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: registered.refreshToken });
    expect(refreshAttempt.status).toBe(401);

    // The new password works; the old one no longer does.
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'resetme', password: 'new-correct-horse' });
    expect(newLogin.status).toBe(200);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'resetme', password: 'correct-horse-battery' });
    expect(oldLogin.status).toBe(401);
  });

  it('rejects reusing an already-used reset token', async () => {
    await registerUser(app, { username: 'reuse', email: 'reuse@example.com' });
    const result = await authService.requestPasswordReset('reuse@example.com');

    const first = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: result!.resetToken, newPassword: 'brand-new-password' });
    expect(first.status).toBe(204);

    const second = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: result!.resetToken, newPassword: 'another-password' });
    expect(second.status).toBe(400);
  });

  it('rejects an expired reset token', async () => {
    await registerUser(app, { username: 'expiredreset', email: 'expiredreset@example.com' });
    const result = await authService.requestPasswordReset('expiredreset@example.com');
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: result!.resetToken, newPassword: 'whatever-new-123' });
    expect(res.status).toBe(400);
  });
});
