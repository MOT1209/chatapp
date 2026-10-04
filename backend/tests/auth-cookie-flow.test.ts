import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';
import * as authService from '../src/services/auth.service.js';
import { REFRESH_COOKIE } from '../src/lib/auth-cookies.js';
import { csrfTokenFor } from '../src/lib/csrf.js';

/**
 * P0-2: the web client's refresh token must never be readable by JavaScript, so it
 * travels in an `HttpOnly` cookie — which in turn means the request carries ambient
 * authority and needs CSRF protection.
 */
let app: Express;

beforeAll(() => {
  app = buildTestApp();
});

afterEach(async () => {
  await resetDb();
});

/** Parses `Set-Cookie` into `{ name, value, flags }`. */
function setCookie(res: request.Response, name = REFRESH_COOKIE) {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const match = raw?.find((c) => c.startsWith(`${name}=`));
  if (!match) return undefined;
  const [pair, ...attrs] = match.split(';').map((p) => p.trim());
  return {
    value: pair.slice(name.length + 1),
    raw: match,
    attrs: attrs.map((a) => a.toLowerCase()),
  };
}

describe('refresh cookie — set on token issuance', () => {
  it('sends an HttpOnly refresh cookie on register, so JS cannot read the token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'cookieuser',
      email: 'cookie@example.com',
      password: 'correct-horse-battery',
      displayName: 'Cookie User',
    });

    expect(res.status).toBe(201);
    const cookie = setCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie?.attrs).toContain('httponly');
  });

  it('sends the same cookie on login', async () => {
    await registerUser(app, { username: 'loginfookie' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'loginfookie', password: 'correct-horse-battery' });

    expect(res.status).toBe(200);
    expect(setCookie(res)?.attrs).toContain('httponly');
  });

  it('scopes the cookie to the auth routes', async () => {
    await registerUser(app, { username: 'pathscope' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'pathscope', password: 'correct-horse-battery' });

    expect(setCookie(login)?.attrs).toContain('path=/api/auth');
  });

  it('still returns the refresh token in the body, so native clients are unaffected', async () => {
    await registerUser(app, { username: 'nativepath' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nativepath', password: 'correct-horse-battery' });

    expect(typeof login.body.refreshToken).toBe('string');
  });

  it('issues a csrf token alongside the cookie', async () => {
    await registerUser(app, { username: 'csrfpair' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'csrfpair', password: 'correct-horse-battery' });

    expect(res.body.csrfToken).toBe(csrfTokenFor(res.body.refreshToken));
  });

  it('withholds the refresh token from a browser, so script injection cannot read it', async () => {
    await registerUser(app, { username: 'webnohint' });
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Platform', 'web')
      .send({ identifier: 'webnohint', password: 'correct-horse-battery' });

    expect(res.body).not.toHaveProperty('refreshToken');
    expect(res.body).not.toHaveProperty('refresh_token');
    // The credential still has to reach the browser, or the session is dead on arrival.
    expect(setCookie(res)?.value).toBeTruthy();
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.csrfToken).toEqual(expect.any(String));
  });

  it('withholds it on refresh too, where the old token would otherwise be echoed back', async () => {
    const { refreshToken } = await registerUser(app, { username: 'webrefresh' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken))
      .set('X-Client-Platform', 'web');

    expect(res.body).not.toHaveProperty('refreshToken');
    expect(res.body.accessToken).toEqual(expect.any(String));
  });
});

describe('refresh via cookie — CSRF is required', () => {
  it('accepts a cookie refresh when the matching csrf header is present', async () => {
    const { refreshToken } = await registerUser(app, { username: 'cookieok' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken));

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('rejects a cookie refresh with no csrf header, which is exactly a forged request', async () => {
    const { refreshToken } = await registerUser(app, { username: 'nocsrf' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a cookie refresh carrying the wrong csrf token', async () => {
    const { refreshToken } = await registerUser(app, { username: 'wrongcsrf' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor('some-other-refresh-token'));

    expect(res.status).toBe(401);
  });

  it('does not burn the session when csrf fails, so the real client is not locked out', async () => {
    const { refreshToken } = await registerUser(app, { username: 'noburn' });
    await request(app).post('/api/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);

    const legit = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken));

    expect(legit.status).toBe(200);
  });

  it('still accepts a body-only refresh with no cookie and no csrf header (native client)', async () => {
    const { refreshToken } = await registerUser(app, { username: 'nativeonly' });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
  });

  it('requires csrf when both a cookie and a body token are present', async () => {
    const { refreshToken } = await registerUser(app, { username: 'bothpresent' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });

  it('rotates the cookie and the csrf token together on a cookie refresh', async () => {
    const { refreshToken } = await registerUser(app, { username: 'rotates' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken));

    expect(setCookie(res)?.value).toBe(res.body.refreshToken);
    expect(res.body.csrfToken).toBe(csrfTokenFor(res.body.refreshToken));
  });

  it('rejects an empty refreshToken string rather than silently using the cookie', async () => {
    const { refreshToken } = await registerUser(app, { username: 'emptystr' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken))
      .send({ refreshToken: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/csrf', () => {
  it('returns the csrf token for a live cookie session', async () => {
    const { refreshToken } = await registerUser(app, { username: 'csrget' });
    const res = await request(app).get('/api/auth/csrf').set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);

    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBe(csrfTokenFor(refreshToken));
  });

  it('401s with no cookie, so the client can tell signed-out from needs-a-token', async () => {
    const res = await request(app).get('/api/auth/csrf');
    expect(res.status).toBe(401);
  });

  it('401s for a revoked session, so a stale cookie cannot bootstrap a csrf token', async () => {
    const { accessToken, refreshToken } = await registerUser(app, { username: 'revokedcsrf' });
    // A genuine revocation, not a made-up token value.
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken))
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app).get('/api/auth/csrf').set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);
    expect(res.status).toBe(401);
  });

  it('does not rotate the session while reading it', async () => {
    const { refreshToken } = await registerUser(app, { username: 'nospin' });
    await request(app).get('/api/auth/csrf').set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken));
    expect(refresh.status).toBe(200);
  });
});

describe('logout — cookie clearing and CSRF', () => {
  it('clears the refresh cookie', async () => {
    const { accessToken, refreshToken } = await registerUser(app, { username: 'logoutcookie' });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken))
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(204);
    const cleared = setCookie(res);
    expect(cleared).toBeDefined();
    expect(cleared?.value).toBe('');
    expect(cleared?.attrs).toContain('httponly');
  });

  it('clears the cookie and answers 204 even when csrf is missing, so logout is never blocked', async () => {
    const { refreshToken } = await registerUser(app, { username: 'logoutnocsrf' });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);

    expect(res.status).toBe(204);
    expect(setCookie(res)?.value).toBe('');
  });

  it('leaves server-side sessions alone when csrf fails, since the request is untrusted', async () => {
    const { refreshToken } = await registerUser(app, { username: 'forgedlogout' });
    await request(app).post('/api/auth/logout').set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);

    const stillWorks = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken));
    expect(stillWorks.status).toBe(200);
  });

  it('revokes the session when csrf is valid, so the cookie cannot be replayed', async () => {
    const { refreshToken } = await registerUser(app, { username: 'realLogout' });
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken));

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .set('X-CSRF-Token', csrfTokenFor(refreshToken));
    expect(replay.status).toBe(401);
  });
});

describe('reset-password — clears stale credentials', () => {
  it('clears the refresh cookie after a reset, since every session was revoked', async () => {
    const { refreshToken } = await registerUser(app, {
      username: 'resetclear',
      email: 'resetclear@example.com',
    });
    const issued = await authService.requestPasswordReset('resetclear@example.com');

    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .send({ token: issued?.resetToken, newPassword: 'a-brand-new-password' });

    expect(res.status).toBe(204);
    expect(setCookie(res)?.value).toBe('');
  });
});