import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser } from '../helpers/harness.js';
import { logger } from '../../src/lib/logger.js';

describe('POST /api/auth/register', () => {
  it('creates a user and returns tokens without leaking secrets', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/register').send({
      username: 'ahmad',
      email: 'ahmad@example.com',
      password: 'correct-horse-battery',
      displayName: 'Ahmad',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'ahmad', email: 'ahmad@example.com', isOnline: false });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(JSON.stringify(res.body)).not.toContain('$2a$'); // no bcrypt hash anywhere
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    const { app } = makeApp();
    await registerUser(app, { username: 'one', email: 'dupe@example.com' });
    const res = await request(app).post('/api/auth/register').send({
      username: 'two',
      email: 'dupe@example.com',
      password: 'correct-horse-battery',
      displayName: 'Two',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.fields).toHaveProperty('email');
  });

  it('rejects a duplicate username with CONFLICT', async () => {
    const { app } = makeApp();
    await registerUser(app, { username: 'sameuser', email: 'a1@example.com' });
    const res = await request(app).post('/api/auth/register').send({
      username: 'sameuser',
      email: 'a2@example.com',
      password: 'correct-horse-battery',
      displayName: 'Two',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.fields).toHaveProperty('username');
  });

  it('validates the body with a fields map', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/register').send({
      username: 'x',
      email: 'not-an-email',
      password: 'short',
      displayName: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['username', 'email', 'password']));
  });
});

describe('POST /api/auth/login', () => {
  it('accepts either username or email', async () => {
    const { app } = makeApp();
    await registerUser(app, { username: 'loginuser', email: 'login@example.com', password: 'correct-horse-battery' });

    const byUsername = await request(app).post('/api/auth/login').send({ identifier: 'loginuser', password: 'correct-horse-battery' });
    const byEmail = await request(app).post('/api/auth/login').send({ identifier: 'login@example.com', password: 'correct-horse-battery' });
    expect(byUsername.status).toBe(200);
    expect(byEmail.status).toBe(200);
  });

  it('returns the same INVALID_CREDENTIALS for wrong password and unknown user', async () => {
    const { app } = makeApp();
    await registerUser(app, { username: 'known', email: 'known@example.com', password: 'correct-horse-battery' });

    const wrongPw = await request(app).post('/api/auth/login').send({ identifier: 'known', password: 'nope-nope-nope' });
    const unknown = await request(app).post('/api/auth/login').send({ identifier: 'ghost', password: 'nope-nope-nope' });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/users/me', () => {
  it('requires a token', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current user with a valid token', async () => {
    const { app } = makeApp();
    const { accessToken, user } = await registerUser(app, { username: 'meuser', email: 'me@example.com' });
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.email).toBe('me@example.com');
  });
});

describe('POST /api/auth/refresh — rotation and reuse', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const { app } = makeApp();
    const { refreshToken } = await registerUser(app);

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);

    // Replaying the original (now rotated) token is treated as reuse.
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);

    // Reuse detection revokes the whole chain, so even the rotated token stops working.
    const afterReuse = await request(app).post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('rejects a malformed refresh token', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'garbage' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes sessions so the refresh token no longer works', async () => {
    const { app } = makeApp();
    const { accessToken, refreshToken } = await registerUser(app);

    const out = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    expect(out.status).toBe(204);

    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe('password reset', () => {
  it('always answers 202 and never reveals account existence', async () => {
    const { app } = makeApp();
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(known.status).toBe(202);
    expect(known.body).toEqual({});
  });

  it('resets the password with a valid token and invalidates sessions', async () => {
    const { app } = makeApp();
    const { refreshToken } = await registerUser(app, { username: 'resetme', email: 'reset@example.com', password: 'correct-horse-battery' });

    const spy = vi.spyOn(logger, 'info');
    await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.com' });
    const logged = spy.mock.calls.find(([msg]) => msg.includes('password reset'));
    const token = (logged?.[1] as { resetToken: string }).resetToken;
    spy.mockRestore();
    expect(token).toBeTruthy();

    const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'a-brand-new-password' });
    expect(reset.status).toBe(204);

    // Old sessions are gone.
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken })).status).toBe(401);
    // Old password no longer works, new one does.
    expect((await request(app).post('/api/auth/login').send({ identifier: 'resetme', password: 'correct-horse-battery' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ identifier: 'resetme', password: 'a-brand-new-password' })).status).toBe(200);
  });

  it('rejects a reused reset token', async () => {
    const { app } = makeApp();
    await registerUser(app, { username: 'reuser', email: 'reuse@example.com' });

    const spy = vi.spyOn(logger, 'info');
    await request(app).post('/api/auth/forgot-password').send({ email: 'reuse@example.com' });
    const token = (spy.mock.calls.find(([m]) => m.includes('password reset'))?.[1] as { resetToken: string }).resetToken;
    spy.mockRestore();

    expect((await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'first-new-password' })).status).toBe(204);
    const second = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'second-new-password' });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('VALIDATION_ERROR');
  });
});
