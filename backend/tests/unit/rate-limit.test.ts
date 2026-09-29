import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { createRateLimit } from '../../src/middleware/rate-limit.js';
import { ApiError } from '../../src/lib/errors.js';

function run(mw: ReturnType<typeof createRateLimit>, ip = '1.1.1.1'): ApiError | null {
  let captured: unknown = null;
  const req = { ip, header: () => undefined } as unknown as Request;
  const res = {} as Response;
  mw(req, res, (err?: unknown) => {
    captured = err ?? null;
  });
  return captured as ApiError | null;
}

describe('rate limiter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows up to max then returns RATE_LIMITED with retryAfter', () => {
    const mw = createRateLimit({ windowMs: 1000, max: 3, prefix: 't' });
    expect(run(mw)).toBeNull();
    expect(run(mw)).toBeNull();
    expect(run(mw)).toBeNull();
    const err = run(mw);
    expect(err).toBeInstanceOf(ApiError);
    expect(err?.code).toBe('RATE_LIMITED');
    expect(err?.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('resets after the window elapses', () => {
    const mw = createRateLimit({ windowMs: 1000, max: 1, prefix: 't2' });
    expect(run(mw)).toBeNull();
    expect(run(mw)?.code).toBe('RATE_LIMITED');
    vi.advanceTimersByTime(1001);
    expect(run(mw)).toBeNull();
  });

  it('tracks separate buckets per client', () => {
    const mw = createRateLimit({ windowMs: 1000, max: 1, prefix: 't3' });
    expect(run(mw, '1.1.1.1')).toBeNull();
    expect(run(mw, '2.2.2.2')).toBeNull();
    expect(run(mw, '1.1.1.1')?.code).toBe('RATE_LIMITED');
  });
});
