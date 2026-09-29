/**
 * Fixed-window in-memory rate limiter.
 *
 * Enough for a single-process Alpha. Auth routes are limited per the contract (§1.3),
 * and search and message sending are limited to blunt abuse. On the limit it throws
 * RATE_LIMITED; the error middleware emits the `Retry-After` header from `retryAfter`.
 *
 * A horizontally-scaled deployment would move this to a shared store (Post-Alpha).
 */

import type { Request, RequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Namespace so different routes do not share a bucket. */
  prefix: string;
  /** Defaults to userId when present, otherwise the client IP. */
  key?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  const keyOf = options.key ?? ((req: Request): string => req.userId ?? req.ip ?? 'unknown');

  return (req, _res, next) => {
    const now = Date.now();
    const key = `${options.prefix}:${keyOf(req)}`;

    // Opportunistic sweep so idle keys do not accumulate forever.
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      next(ApiError.rateLimited(retryAfter));
      return;
    }

    bucket.count += 1;
    next();
  };
}
