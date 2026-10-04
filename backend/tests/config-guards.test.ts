import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Configuration-integrity guards (Phase 1, config audit).
 *
 * Three separate classes of failure are pinned here, all of which had shipped as
 * silent no-ops: a documented variable that nothing read, a hard-coded value that
 * silently disabled a security control, and a NODE_ENV combination that turns off
 * every rate limiter.
 */

describe('env validation — NODE_ENV=test cannot be pointed at a real database', () => {
  // NODE_ENV=test switches off every rate limiter (middleware/rate-limit.ts) and
  // relaxes the secret checks (config/env.ts). The test suite needs that, but a
  // deployment that inherited it would run with no auth throttling at all — so the
  // one combination that is unambiguously a mistake (test mode plus a database that
  // is not on this machine) has to refuse to boot.
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  async function loadEnvWith(overrides: Record<string, string> = {}) {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      JWT_ACCESS_SECRET: 'test-access',
      JWT_REFRESH_SECRET: 'test-refresh',
      ...overrides,
    };
    vi.resetModules();
    return import('../src/config/env.js');
  }

  it('refuses NODE_ENV=test against a remote database host', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadEnvWith({ DATABASE_URL: 'postgresql://u:p@db.production.example:5432/app' })).rejects.toThrow();
    errSpy.mockRestore();
  });

  it('refuses it for a cloud database hostname too', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadEnvWith({ DATABASE_URL: 'postgresql://u:p@db.eu-west-1.aws.amazon.com:5432/app' })).rejects.toThrow();
    errSpy.mockRestore();
  });

  it('refuses it for an unparseable DATABASE_URL rather than failing open', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadEnvWith({ DATABASE_URL: 'not a url at all' })).rejects.toThrow();
    errSpy.mockRestore();
  });

  it('still starts for the real test-suite database on localhost', async () => {
    const { env } = await loadEnvWith();
    expect(env.NODE_ENV).toBe('test');
  });

  it('still starts for IPv6 loopback and for 0.0.0.0', async () => {
    await expect(loadEnvWith({ DATABASE_URL: 'postgresql://u:p@[::1]:5432/x' })).resolves.toBeTruthy();
    await expect(loadEnvWith({ DATABASE_URL: 'postgresql://u:p@0.0.0.0:5432/x' })).resolves.toBeTruthy();
  });

  it('does not constrain a non-test NODE_ENV pointing at a remote database', async () => {
    const { env } = await loadEnvWith({ NODE_ENV: 'development' });
    expect(env.NODE_ENV).toBe('development');
  });
});

describe('env validation — TRUST_PROXY', () => {
  // Every per-IP rate limiter keys on req.ip, which Express derives from the proxy
  // hop count. One hop too many and a client spoofs X-Forwarded-For and walks past
  // the auth limiters; one hop too few and every user behind the proxy shares a
  // single bucket, so one abusive client locks out everyone.
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  async function loadEnvWith(overrides: Record<string, string> = {}) {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      JWT_ACCESS_SECRET: 'a',
      JWT_REFRESH_SECRET: 'b',
      ...overrides,
    };
    vi.resetModules();
    return import('../src/config/env.js');
  }

  it('defaults to a single proxy hop and exposes it as a number', async () => {
    const { trustProxy } = await loadEnvWith();
    expect(trustProxy).toBe(1);
  });

  it('accepts an explicit hop count, including zero for a directly exposed server', async () => {
    await expect(loadEnvWith({ TRUST_PROXY: '0' }).then((m) => m.trustProxy)).resolves.toBe(0);
    await expect(loadEnvWith({ TRUST_PROXY: '3' }).then((m) => m.trustProxy)).resolves.toBe(3);
  });

  it('rejects a non-numeric value instead of silently treating it as a hop count', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadEnvWith({ TRUST_PROXY: 'true' })).rejects.toThrow();
    errSpy.mockRestore();
  });
});

describe('env validation — maintenance job budgets', () => {
  // The cleanup CLI documented CLEANUP_BATCH_SIZE, SESSION_RETENTION_DAYS and
  // RESET_TOKEN_RETENTION_DAYS in a header comment while reading none of them, so
  // an operator could set them in the environment and watch them be ignored. These
  // tests exist to fail if that divergence comes back.
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  async function loadEnvWith(overrides: Record<string, string> = {}) {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      JWT_ACCESS_SECRET: 'a',
      JWT_REFRESH_SECRET: 'b',
      ...overrides,
    };
    vi.resetModules();
    return import('../src/config/env.js');
  }

  it('has safe defaults that match the documented ones', async () => {
    const { env } = await loadEnvWith();
    expect(env.CLEANUP_BATCH_SIZE).toBe(500);
    expect(env.SESSION_RETENTION_DAYS).toBe(30);
    expect(env.RESET_TOKEN_RETENTION_DAYS).toBe(30);
  });

  it('honours configured values', async () => {
    const { env } = await loadEnvWith({
      CLEANUP_BATCH_SIZE: '250',
      SESSION_RETENTION_DAYS: '7',
      RESET_TOKEN_RETENTION_DAYS: '3',
    });
    expect(env.CLEANUP_BATCH_SIZE).toBe(250);
    expect(env.SESSION_RETENTION_DAYS).toBe(7);
    expect(env.RESET_TOKEN_RETENTION_DAYS).toBe(3);
  });

  it('rejects a nonsensical batch size rather than deleting one row at a time forever', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadEnvWith({ CLEANUP_BATCH_SIZE: '0' })).rejects.toThrow();
    errSpy.mockRestore();
  });
});