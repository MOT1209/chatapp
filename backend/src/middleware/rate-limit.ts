import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Contract requires `RATE_LIMITED` (429) with a `Retry-After` header
 * (docs/api-contract.md §1.3). express-rate-limit sets `Retry-After` itself when
 * a request is blocked; this handler only needs to shape the body.
 */
function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    },
  });
}

// Disabled in tests: vitest fires many requests per file and rate limiting would
// make the suite flaky rather than testing anything meaningful. The test-only
// builder at the bottom re-creates the real limiters with this switch off, so
// the bucket *separation* is still provable in tests.
const disabled = env.NODE_ENV === 'test';

/** Falls back to IP, normalising a v6 address to its /64 so one client can't fan out. */
function byIp(req: Request): string {
  return ipKeyGenerator(req.ip ?? 'unknown');
}

function limiter(options: { windowMs: number; max: number; keyGenerator?: (req: Request) => string }) {
  return rateLimit({
    windowMs: options.windowMs,
    max: disabled ? 1_000_000 : options.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: options.keyGenerator ?? byIp,
  });
}

/**
 * Auth operations each get their OWN bucket (repair brief §9): sharing one
 * global bucket meant a burst of, say, forgot-password attempts could lock
 * every user out of *login* — and brute-forcing login must not consume the
 * refresh budget, which would let an attacker DoS a client's session renewal
 * by merely hammering the login endpoint from the same IP.
 *
 * All are per-IP (these endpoints are pre-auth; there is no user id to key on).
 * The per-account forgot-password cooldown lives in auth.service and is
 * deliberately separate from these transport-level budgets.
 */
export const AUTH_RATE_LIMITS = {
  /** POST /api/auth/register — bcrypt-costly, so the tightest write-side budget. */
  register: { windowMs: 15 * 60 * 1000, max: 10 },
  /** POST /api/auth/login — brute-force protection. */
  login: { windowMs: 15 * 60 * 1000, max: 20 },
  /** POST /api/auth/refresh — every web page load can refresh once; multiple devices share one IP. */
  refresh: { windowMs: 15 * 60 * 1000, max: 60 },
  /** POST /api/auth/forgot-password — this endpoint triggers outbound email, so it is an amplifier. */
  forgotPassword: { windowMs: 15 * 60 * 1000, max: 5 },
  /** POST /api/auth/reset-password — bcrypt + a password write; a used-token replay must not lock the IP out of login. */
  resetPassword: { windowMs: 15 * 60 * 1000, max: 10 },
} as const;

export const registerRateLimit = limiter({ ...AUTH_RATE_LIMITS.register });
export const loginRateLimit = limiter({ ...AUTH_RATE_LIMITS.login });
export const refreshRateLimit = limiter({ ...AUTH_RATE_LIMITS.refresh });
export const forgotPasswordRateLimit = limiter({ ...AUTH_RATE_LIMITS.forgotPassword });
export const resetPasswordRateLimit = limiter({ ...AUTH_RATE_LIMITS.resetPassword });

/** GET /api/users/search — per authenticated user (falls back to IP pre-auth). */
export const searchRateLimit = limiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.userId ?? byIp(req),
});

/** POST /api/conversations/:id/messages — per authenticated user, basic spam guard. */
export const messageRateLimit = limiter({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.userId ?? byIp(req),
});

/**
 * Test-only: rebuilds the five auth limiters with the test-mode `disabled`
 * switch forced OFF, using the same handler, key generator and budgets as the
 * real ones. Exists so a test can prove the actual 429/Retry-After/RATE_LIMITED
 * behaviour AND that each endpoint owns an independent bucket, since the
 * exported limiters above are no-ops for the whole suite's NODE_ENV=test run.
 */
export function buildAuthRateLimitersForTests() {
  const build = (budget: { windowMs: number; max: number }) =>
    rateLimit({
      windowMs: budget.windowMs,
      max: budget.max,
      standardHeaders: true,
      legacyHeaders: false,
      handler: rateLimitHandler,
      keyGenerator: byIp,
    });
  return {
    register: build(AUTH_RATE_LIMITS.register),
    login: build(AUTH_RATE_LIMITS.login),
    refresh: build(AUTH_RATE_LIMITS.refresh),
    forgotPassword: build(AUTH_RATE_LIMITS.forgotPassword),
    resetPassword: build(AUTH_RATE_LIMITS.resetPassword),
  };
}

/**
 * Test-only: builds a limiter that ignores the test-mode `disabled` switch
 * above, using the same handler and IP key generator as the real limiters.
 * Exists so a test can prove the actual 429/Retry-After/RATE_LIMITED
 * behaviour works, since every exported limiter above is a no-op for the
 * whole suite's NODE_ENV=test run. Not used by any route.
 */
export function createRateLimiterForTests(options: {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: options.keyGenerator ?? byIp,
  });
}
