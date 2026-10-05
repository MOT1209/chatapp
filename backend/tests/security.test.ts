import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createRateLimiterForTests } from '../src/middleware/rate-limit.js';

describe('env validation — JWT secret strength', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  async function loadEnvWith(nodeEnv: string, overrides: Record<string, string> = {}) {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: nodeEnv,
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      // A production instance must refuse to boot without a mail transport, so a
      // baseline that only varies the JWT secrets has to look deployable.
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
      SMTP_FROM: 'no-reply@example.test',
      APP_BASE_URL: 'https://app.example.test',
      ...overrides,
    };
    vi.resetModules();
    return import('../src/config/env.js');
  }

  it('accepts long, distinct, non-placeholder secrets in production', async () => {
    const { env } = await loadEnvWith('production');
    expect(env.NODE_ENV).toBe('production');
  });

  it('rejects a known placeholder secret in production', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadEnvWith('production', { JWT_ACCESS_SECRET: 'change-me-access' })).rejects.toThrow();
    errSpy.mockRestore();
  });

  it('rejects a too-short secret in production even if not on the placeholder list', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadEnvWith('production', { JWT_ACCESS_SECRET: 'kinda-short-secret' })).rejects.toThrow();
    errSpy.mockRestore();
  });

  it('rejects identical access and refresh secrets in production', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const same = 'c'.repeat(48);
    await expect(
      loadEnvWith('production', { JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same }),
    ).rejects.toThrow();
    errSpy.mockRestore();
  });

  it('never includes the offending secret value in the logged error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadEnvWith('production', { JWT_ACCESS_SECRET: 'change-me-access' })).rejects.toThrow();
    const loggedText = errSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(loggedText).not.toContain('change-me-access');
    errSpy.mockRestore();
  });

  it('allows short, obviously-fake secrets in development', async () => {
    const { env } = await loadEnvWith('development', {
      JWT_ACCESS_SECRET: 'dev-access-secret-change-me',
      JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me',
    });
    expect(env.NODE_ENV).toBe('development');
  });

  it('allows short, obviously-fake secrets in test', async () => {
    const { env } = await loadEnvWith('test', {
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    });
    expect(env.NODE_ENV).toBe('test');
  });
});

describe('env validation — password reset transport (P0-1)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  async function loadEnvWith(overrides: Record<string, string> = {}) {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      APP_BASE_URL: 'https://app.example.test',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
      SMTP_FROM: 'no-reply@example.test',
      ...overrides,
    };
    vi.resetModules();
    return import('../src/config/env.js');
  }

  /**
   * The thrown Error deliberately carries no field detail — a rejected config is
   * often about a secret, and the message is what lands in a crash log. So the
   * assertion has to read the operator-facing diagnostics that `config/env.ts`
   * prints, which is also what proves the failure is actually explainable.
   */
  async function expectRejected(overrides: Record<string, string>, expectedDiagnostic: RegExp) {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(loadEnvWith(overrides)).rejects.toThrow();
      const logged = errSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
      expect(logged).toMatch(expectedDiagnostic);
    } finally {
      errSpy.mockRestore();
    }
  }

  it('refuses to boot production without SMTP_HOST, because a reset email could never be sent', async () => {
    await expectRejected({ SMTP_HOST: '' }, /SMTP_HOST/);
  });

  it('refuses to boot production without SMTP_FROM, so the envelope sender is explicit', async () => {
    await expectRejected({ SMTP_FROM: '' }, /SMTP_FROM/);
  });

  it('rejects a half-configured credential pair, which would bounce every email', async () => {
    await expectRejected({ SMTP_USER: 'postmaster' }, /SMTP_USER and SMTP_PASS/);
  });

  it('rejects an http:// APP_BASE_URL in production, since it is mailed inside the reset link', async () => {
    await expectRejected({ APP_BASE_URL: 'http://app.example.test' }, /https/);
  });

  it('rejects a wildcard CORS_ORIGIN in production now that requests are credentialed', async () => {
    await expectRejected({ CORS_ORIGIN: '*' }, /explicit origins/);
  });

  it('rejects SameSite=none without Secure, which browsers would reject outright', async () => {
    await expectRejected({ COOKIE_SAME_SITE: 'none' }, /COOKIE_SECURE/);
  });

  it('reports every missing SMTP field at once, so a misconfigured deploy is fixable in one pass', async () => {
    await expectRejected({ SMTP_HOST: '', SMTP_PORT: '', SMTP_FROM: '' }, /SMTP_HOST, SMTP_PORT, SMTP_FROM/);
  });

  it('ships a cooldown long enough to actually limit mail to one mailbox', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      APP_BASE_URL: 'https://app.example.test',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
      SMTP_FROM: 'no-reply@example.test',
    };
    // vitest.config.ts pins these to 0 so suites are not rate limited; drop them
    // here so the assertion reads the default that actually ships.
    delete process.env.PASSWORD_RESET_COOLDOWN_SECONDS;
    delete process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES;
    vi.resetModules();

    const { env } = await import('../src/config/env.js');

    // The per-account cooldown is the only limit on how often forgot-password can
    // mail one address, so a default of a few seconds would be no limit at all.
    expect(env.PASSWORD_RESET_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(300);
    expect(env.PASSWORD_RESET_TOKEN_TTL_MINUTES).toBeGreaterThanOrEqual(15);
  });

  it('does not require SMTP outside production, so local dev and tests run without a provider', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      JWT_ACCESS_SECRET: 'dev-access-secret-change-me',
      JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me',
      // Set explicitly: dotenv re-reads backend/.env on every module reset and only
      // skips variables that already exist, so without this the assertion depends
      // on whether the developer's own .env configures SMTP.
      SMTP_HOST: '',
    };
    vi.resetModules();
    const { smtpConfigured } = await import('../src/config/env.js');
    expect(smtpConfigured).toBe(false);
  });

  it('still rejects a half-configured credential pair in development', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      JWT_ACCESS_SECRET: 'dev-access-secret-change-me',
      JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me',
      SMTP_USER: 'postmaster',
    };
    vi.resetModules();
    try {
      await expect(import('../src/config/env.js')).rejects.toThrow();
      expect(JSON.stringify(errSpy.mock.calls)).toMatch(/SMTP_USER and SMTP_PASS/);
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe('env validation — cookie policy (P0-2)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  async function loadEnvWith(nodeEnv: string, overrides: Record<string, string> = {}) {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: nodeEnv,
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
      SMTP_FROM: 'no-reply@example.test',
      APP_BASE_URL: 'https://app.example.test',
      ...overrides,
    };
    vi.resetModules();
    return import('../src/config/env.js');
  }

  it('forces the Secure flag on in production regardless of configuration', async () => {
    const { cookieOptions } = await loadEnvWith('production', { COOKIE_SECURE: '' });
    expect(cookieOptions.secure).toBe(true);
  });

  it('honours an explicit COOKIE_SECURE=false outside production for plain-http local testing', async () => {
    const { cookieOptions } = await loadEnvWith('development', { COOKIE_SECURE: 'false' });
    expect(cookieOptions.secure).toBe(false);
  });

  it('scopes the cookie to the auth routes by default', async () => {
    const { cookieOptions } = await loadEnvWith('development');
    expect(cookieOptions.path).toBe('/api/auth');
  });

  it('defaults to SameSite=lax, which blocks the cross-site POST a CSRF attack needs', async () => {
    const { cookieOptions } = await loadEnvWith('development');
    expect(cookieOptions.sameSite).toBe('lax');
  });
});

describe('error handler — production never leaks internals', () => {
  it('returns only { error: { code, message } } even when the underlying Error contains sensitive text', () => {
    const sensitive = new Error('connection failed for user postgres with password Sup3rSecret!42');
    const jsonMock = vi.fn();
    const statusMock = vi.fn(() => ({ json: jsonMock }));
    const res = { status: statusMock } as unknown as Parameters<typeof errorHandler>[2];
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(sensitive, {} as never, res, (() => undefined) as never);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      error: { code: 'SERVER_ERROR', message: expect.any(String) },
    });
    const responseText = JSON.stringify(jsonMock.mock.calls[0]?.[0]);
    expect(responseText).not.toContain('Sup3rSecret');
    expect(responseText).not.toContain('postgres');
    errSpy.mockRestore();
  });
});

describe('rate limiting — real 429 behaviour', () => {
  // Production rate limits are disabled in the actual test run (see
  // rate-limit.ts) so the suite isn't flaky. This builds an isolated limiter
  // from the same shared handler/key-generator code to prove the real 429
  // shape works, independent of that test-mode switch.
  function buildProbeApp(max: number) {
    const app = express();
    app.use(createRateLimiterForTests({ windowMs: 60_000, max }));
    app.get('/probe', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  it('returns RATE_LIMITED with a Retry-After header once the limit is exceeded', async () => {
    const app = buildProbeApp(2);
    const agent = request.agent(app);

    await agent.get('/probe').expect(200);
    await agent.get('/probe').expect(200);
    const blocked = await agent.get('/probe');

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('does not block requests within the limit', async () => {
    const app = buildProbeApp(5);
    const agent = request.agent(app);
    for (let i = 0; i < 5; i += 1) {
      await agent.get('/probe').expect(200);
    }
  });
});

describe('error logging redaction', () => {
  it('logs only the type and code of Prisma errors, never their message (which embeds query arguments)', async () => {
    const { Prisma } = await import('@prisma/client');
    const { describeError } = await import('../src/middleware/error-handler.js');
    const err = new Prisma.PrismaClientKnownRequestError('Invalid `create()` args: body: "my secret message"', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['senderId', 'clientId'] },
    });
    const logged = JSON.stringify(describeError(err));
    expect(logged).not.toContain('secret message');
    expect(logged).toContain('P2002');
  });
});
