import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * CSRF protection for the two endpoints whose authority comes from an ambient
 * HttpOnly cookie: `POST /auth/refresh` and `POST /auth/logout`.
 *
 * The token is `HMAC-SHA256(JWT_REFRESH_SECRET, refreshToken)`. That choice buys
 * three things over a stored random value:
 *
 *   1. **No new state.** The server can recompute the expected value from the
 *      refresh token it already received, so there is no table, column or cache
 *      to keep in sync with session rotation.
 *   2. **Rotation-safe.** Refreshing produces a new refresh token, hence a new
 *      CSRF token; both travel together in the same response, so they cannot
 *      drift apart.
 *   3. **No extra round trip on the common path.** The token is handed to the
 *      client in the same body that already carries the tokens.
 *
 * The browser attaches the cookie on its own, which is exactly the capability an
 * attacker's page can borrow. Requiring the value back in a custom header —
 * something a cross-site form or `<img>` cannot set — proves the request came from
 * script that could read the cookie, which is only our own origin.
 */
const DOMAIN_PREFIX = 'chatapp:csrf:v1:';

/** Hex-encoded HMAC of the refresh token. Stable for a given (token, secret) pair. */
export function csrfTokenFor(refreshToken: string): string {
  return crypto
    .createHmac('sha256', env.JWT_REFRESH_SECRET)
    .update(DOMAIN_PREFIX + refreshToken)
    .digest('hex');
}

/**
 * Constant-time comparison of the presented header against the expected token.
 * A plain `===` would leak the expected value one character at a time through
 * response timing.
 */
export function csrfMatches(expected: string, presented: unknown): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');
  // timingSafeEqual throws on a length mismatch, so lengths are compared first.
  // The length of a fixed-size hex digest is not a secret.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}