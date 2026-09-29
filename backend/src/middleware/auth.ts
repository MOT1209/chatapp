/**
 * Bearer-token authentication.
 *
 * Verifies `Authorization: Bearer <accessToken>` and attaches `req.userId`. A missing
 * or malformed header is UNAUTHENTICATED; an expired token is TOKEN_EXPIRED, which the
 * frontend answers with a silent refresh and one retry (docs/api-contract.md §5.1).
 */

import type { Request, RequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    next(ApiError.unauthenticated('A bearer token is required.'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(ApiError.unauthenticated('A bearer token is required.'));
    return;
  }
  try {
    req.userId = verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
};

/** Reads the authenticated user id, asserting the middleware ran first. */
export function currentUserId(req: Request): string {
  if (!req.userId) {
    throw ApiError.unauthenticated();
  }
  return req.userId;
}
