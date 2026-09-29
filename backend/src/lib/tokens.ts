/**
 * JWT access tokens and opaque-ish refresh tokens.
 *
 * Access tokens are short-lived and carry the user id. Refresh tokens are long-lived
 * JWTs whose SHA-256 hash is stored in the `Session` table, so the server can revoke
 * and rotate them (docs/api-contract.md §3.1). The raw refresh token is never stored.
 */

import { createHash, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';

type AccessClaims = { sub: string; typ: 'access' };
type RefreshClaims = { sub: string; typ: 'refresh'; jti: string };

export function signAccessToken(userId: string): string {
  return jwt.sign({ typ: 'access' } satisfies Omit<AccessClaims, 'sub'>, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.JWT_ACCESS_TTL,
  } as jwt.SignOptions);
}

export type SignedRefresh = { token: string; hash: string; expiresAt: Date };

export function signRefreshToken(userId: string): SignedRefresh {
  const jti = randomUUID();
  const token = jwt.sign(
    { typ: 'refresh', jti } satisfies Omit<RefreshClaims, 'sub'>,
    env.JWT_REFRESH_SECRET,
    { subject: userId, expiresIn: env.JWT_REFRESH_TTL } as jwt.SignOptions,
  );
  const decoded = jwt.decode(token) as JwtPayload | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 2_592_000_000);
  return { token, hash: hashToken(token), expiresAt };
}

/** Deterministic hash used as the `Session.refreshHash` lookup key. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Verifies an access token, returning the user id. Throws a mapped ApiError otherwise. */
export function verifyAccessToken(token: string): string {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
      throw ApiError.unauthenticated('Malformed access token.');
    }
    return payload.sub;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.tokenExpired();
    }
    throw ApiError.unauthenticated('Invalid access token.');
  }
}

/** Verifies a refresh token's signature and shape. Throws UNAUTHENTICATED otherwise. */
export function verifyRefreshToken(token: string): { userId: string; jti: string } {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
    if (payload.typ !== 'refresh' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
      throw ApiError.unauthenticated('Malformed refresh token.');
    }
    return { userId: payload.sub, jti: payload.jti };
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Expired, revoked-shaped, or tampered: all map to UNAUTHENTICATED per the contract.
    throw ApiError.unauthenticated('The refresh token is invalid or expired.');
  }
}
