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
