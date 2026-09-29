import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AccessTokenPayload = {
  sub: string; // user id
};

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export type VerifyAccessTokenResult =
  | { ok: true; userId: string; expiresAtMs: number }
  | { ok: false; reason: 'expired' | 'invalid' };

export function verifyAccessToken(token: string): VerifyAccessTokenResult {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
    if (typeof decoded.sub !== 'string' || decoded.sub.length === 0) {
      return { ok: false, reason: 'invalid' };
    }
    const exp = (decoded as AccessTokenPayload & { exp?: number }).exp;
    if (typeof exp !== 'number') {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, userId: decoded.sub, expiresAtMs: exp * 1000 };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }
}

/**
 * Refresh tokens are opaque random strings, not JWTs. Only their SHA-256 hash is
 * stored (in Session.refreshHash), so a leaked database dump does not hand out
 * usable tokens, and revocation is a single row update.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiryDate(): Date {
  const ttl = env.JWT_REFRESH_TTL;
  const ms = parseDurationToMs(ttl);
  return new Date(Date.now() + ms);
}

/** Parses simple durations like "30d", "15m", "1h", "45s". Falls back to 30 days. */
function parseDurationToMs(input: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(input.trim());
  if (!match) {
    return 30 * 24 * 60 * 60 * 1000;
  }
  const [, amountStr, unit] = match;
  const amount = Number(amountStr);
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * (unitMs[unit as string] ?? unitMs.d!);
}
