import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { tokenExpired, unauthenticated } from '../lib/errors.js';

/**
 * Protects a route: requires `Authorization: Bearer <accessToken>`.
 * On success sets `req.userId`. On failure throws AppError, handled centrally.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(unauthenticated('Missing or malformed Authorization header.'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(unauthenticated('Missing bearer token.'));
    return;
  }

  const result = verifyAccessToken(token);
  if (!result.ok) {
    next(result.reason === 'expired' ? tokenExpired() : unauthenticated('Invalid access token.'));
    return;
  }

  req.userId = result.userId;
  next();
}
