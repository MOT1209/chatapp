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
// make the suite flaky rather than testing anything meaningful.
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

/** POST /api/auth/register, /login, /forgot-password, /reset-password — per IP. */
export const authRateLimit = limiter({ windowMs: 15 * 60 * 1000, max: 20 });

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
