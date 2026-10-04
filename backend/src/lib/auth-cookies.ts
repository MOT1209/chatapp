import type { Request, Response } from 'express';
import { cookieOptions } from '../config/env.js';

/**
 * The refresh token lives here for web clients, where it can no longer be read by
 * injected JavaScript. `HttpOnly` is the whole point: an XSS payload cannot call
 * `document.cookie`, so the long-lived credential is not exfiltratable even if
 * script injection succeeds.
 *
 * The other flags:
 *   Secure      — HTTPS only. Forced on in production (see cookieOptions).
 *   SameSite    — `lax` (default) still sends the cookie on top-level navigations,
 *                 which a user returning to the app needs, while blocking the
 *                 cross-site POST that CSRF relies on.
 *   Path        — scoped to the auth routes, so the token is never attached to
 *                 /users or /conversations requests.
 */
export const REFRESH_COOKIE = 'chatapp_rt';

/** Prefixed so a cookie parser cannot confuse it with a real cookie. */
const COOKIE_PREFIX = `${REFRESH_COOKIE}=`;

/**
 * Minimal `Cookie:` header reader. Only needed for our own single-valued cookie,
 * so this deliberately avoids pulling in `cookie-parser` (whose signed-cookie
 * machinery is unused here) and decoding nothing it does not have to.
 */
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const pair = part.trim();
    if (pair.startsWith(COOKIE_PREFIX)) {
      const value = pair.slice(COOKIE_PREFIX.length).trim();
      if (value.length > 0) return value;
    }
  }
  return undefined;
}

/** Writes the refresh cookie. `maxAgeSeconds` mirrors the session's own expiry. */
export function setRefreshCookie(res: Response, refreshToken: string, maxAgeSeconds: number): void {
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: maxAgeSeconds * 1000 });
}

/**
 * Clears the refresh cookie. The attributes must match the ones used when setting
 * it, otherwise the browser keeps the original cookie (a `Secure` cookie cannot be
 * overwritten by a non-`Secure` one, and a `Path` mismatch creates a second cookie).
 */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}

/**
 * How a client says "keep the refresh token in the cookie".
 *
 * A browser cannot be told apart from a native app by anything the server can see:
 * both send the same JSON to `POST /auth/login`, and only the browser honours
 * `Set-Cookie`. So the client states it, and the server answers accordingly.
 *
 * The direction of the bet is safe. A client that lies can only *withhold* the
 * token from itself; a client that forgets the header (every native build released
 * so far) still gets the token in the body and behaves exactly as before.
 */
export const COOKIE_TRANSPORT_HEADER = 'x-client-platform';
export const COOKIE_TRANSPORT_VALUE = 'web';

export function wantsCookieTransport(req: Request): boolean {
  const presented = req.headers[COOKIE_TRANSPORT_HEADER];
  const header = Array.isArray(presented) ? presented[0] : presented;
  return typeof header === 'string' && header.trim().toLowerCase() === COOKIE_TRANSPORT_VALUE;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * The body of a successful register/login/refresh.
 *
 * With cookie transport the refresh token is *omitted*, not merely ignored by the
 * client. Leaving it in would hand back the very secret the `HttpOnly` cookie was
 * introduced to protect: any script injected into the page can read the response to
 * its own fetch, so a token in the body is exfiltratable no matter what the client
 * does with it afterwards.
 */
export function authResponseBody(
  tokens: AuthTokens,
  csrfToken: string,
  cookieTransport: boolean,
): Record<string, string> {
  if (cookieTransport) return { accessToken: tokens.accessToken, csrfToken };
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, csrfToken };
}