import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/test-app.js';

/**
 * Repair brief §17: every HTTP request carries a request ID — returned in the
 * X-Request-Id header and present in the structured request log together with
 * method, route, status and duration. Request bodies and query strings are
 * never logged.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Collects structured log lines (the logger writes `info` via console.info) as parsed JSON objects. */
function captureLogs(): { lines: Record<string, unknown>[]; restore: () => void } {
  const lines: Record<string, unknown>[] = [];
  const capture = (...args: unknown[]) => {
    try {
      lines.push(JSON.parse(String(args[0])) as Record<string, unknown>);
    } catch {
      lines.push({ raw: String(args[0]) });
    }
  };
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(capture),
    vi.spyOn(console, 'info').mockImplementation(capture),
  ];
  return { lines, restore: () => spies.forEach((spy) => spy.mockRestore()) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('request id middleware', () => {
  it('returns a fresh X-Request-Id on every request', async () => {
    const app = buildTestApp();
    const first = await request(app).get('/health');
    const second = await request(app).get('/health');
    expect(first.headers['x-request-id']).toMatch(UUID_RE);
    expect(second.headers['x-request-id']).toMatch(UUID_RE);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('echoes a well-formed inbound X-Request-Id instead of minting a new one', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/health').set('X-Request-Id', 'gateway-trace-12345678');
    expect(res.headers['x-request-id']).toBe('gateway-trace-12345678');
  });

  it('replaces a malformed inbound X-Request-Id (injection-safe)', async () => {
    const app = buildTestApp();
    // Note: a header with a raw newline is rejected by Node's http client before
    // it ever reaches the app, so it cannot be part of an HTTP request here.
    for (const hostile of ['short', 'has spaces in it', '"quoted"', `${'x'.repeat(65)}`]) {
      const res = await request(app).get('/health').set('X-Request-Id', hostile);
      expect(res.headers['x-request-id'], `hostile id ${JSON.stringify(hostile)} must be replaced`).toMatch(UUID_RE);
    }
  });

  it('logs method, route pattern, status, duration and requestId — one line per request', async () => {
    const app = buildTestApp();
    const { lines, restore } = captureLogs();
    try {
      const res = await request(app).get('/health');
      const entry = lines.find((line) => line.message === 'http request');
      expect(entry).toBeDefined();
      expect(entry!.requestId).toBe(res.headers['x-request-id']);
      expect(entry!.method).toBe('GET');
      expect(entry!.route).toBe('/health');
      expect(entry!.status).toBe(200);
      expect(typeof entry!.durationMs).toBe('number');
      expect(entry!.durationMs as number).toBeGreaterThanOrEqual(0);
    } finally {
      restore();
    }
  });

  it('never logs query strings or request bodies', async () => {
    const app = buildTestApp();
    const { lines, restore } = captureLogs();
    try {
      await request(app).get('/health?resetToken=super-secret-token').send();
      const all = JSON.stringify(lines);
      expect(all).not.toContain('super-secret-token');
      // The route is logged as the matched pattern, never with its query string.
      expect(all).not.toContain('resetToken=');
    } finally {
      restore();
    }
  });

  it('logs unmatched routes (404s) with their path so they remain traceable', async () => {
    const app = buildTestApp();
    const { lines, restore } = captureLogs();
    try {
      const res = await request(app).get('/definitely-not-a-route');
      expect(res.status).toBe(404);
      const entry = lines.find((line) => line.message === 'http request');
      expect(entry).toBeDefined();
      expect(entry!.status).toBe(404);
      expect(entry!.route).toBe('/definitely-not-a-route');
    } finally {
      restore();
    }
  });
});
