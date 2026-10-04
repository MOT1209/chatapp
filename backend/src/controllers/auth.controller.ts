import type { Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../lib/async-handler.js';
import {
  authResponseBody,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
  wantsCookieTransport,
  type AuthTokens,
} from '../lib/auth-cookies.js';
import { csrfMatches, csrfTokenFor } from '../lib/csrf.js';
import { refreshTokenTtlSeconds } from '../lib/jwt.js';
import { unauthenticated } from '../lib/errors.js';
import type { RegisterBody, LoginBody } from '../validators/auth.validators.js';

function sessionMeta(req: Request): { userAgent?: string; ipAddress?: string } {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };
}

/**
 * Builds a token response: stamps the browser credentials onto it (the refresh token
 * as an `HttpOnly` cookie plus the CSRF token for the next cookie-authenticated call)
 * and decides whether the refresh token *also* travels in the JSON body.
 *
 * Native clients ignore `Set-Cookie` and keep using the body, so it stays there for
 * them. A client that asked for cookie transport never receives it — see
 * [authResponseBody].
 */
function authResponse(req: Request, res: Response, tokens: AuthTokens): Record<string, string> {
  setRefreshCookie(res, tokens.refreshToken, refreshTokenTtlSeconds());
  return authResponseBody(tokens, csrfTokenFor(tokens.refreshToken), wantsCookieTransport(req));
}

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RegisterBody;
  const result = await authService.register(body, sessionMeta(req));
  // Contract §3.1: register and login both return the freshly created/fetched
  // user alongside the tokens; refresh (below) returns tokens only.
  res.status(201).json({ user: result.user, ...authResponse(req, res, result) });
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as LoginBody;
  const result = await authService.login(body, sessionMeta(req));
  res.status(200).json({ user: result.user, ...authResponse(req, res, result) });
});

/**
 * The refresh token may arrive in the JSON body (native clients) or in the
 * `HttpOnly` cookie (web clients). The body wins when both are present.
 *
 * A cookie is *ambient authority* — the browser attaches it to a request the user
 * never intended to make — so whenever one is used the request must also carry the
 * matching CSRF header. Without that check, any third-party page could silently
 * rotate a victim's session (logout CSRF) or drive refresh calls under their
 * account.
 */
export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const cookieToken = readRefreshCookie(req);
  const bodyToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  const refreshToken = typeof bodyToken === 'string' && bodyToken.length > 0 ? bodyToken : cookieToken;

  if (cookieToken !== undefined) {
    const presented = req.headers['x-csrf-token'];
    const header = Array.isArray(presented) ? presented[0] : presented;
    if (!csrfMatches(csrfTokenFor(cookieToken), header)) {
      throw unauthenticated('Missing or invalid CSRF token.');
    }
  }

  if (!refreshToken) {
    throw unauthenticated('Missing refresh token.');
  }

  const tokens = await authService.refresh(refreshToken, sessionMeta(req));
  res.status(200).json(authResponse(req, res, tokens));
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  // The body is optional and deliberately not validated: a malformed one must not
  // stop the user from logging out. The service ignores anything but a string.
  const cookieToken = readRefreshCookie(req);
  const bodyToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;

  if (cookieToken !== undefined) {
    const presented = req.headers['x-csrf-token'];
    const header = Array.isArray(presented) ? presented[0] : presented;
    if (!csrfMatches(csrfTokenFor(cookieToken), header)) {
      // Same contract as before: a rejected logout must never block the user from
      // leaving, so this clears the browser credentials and answers 204 rather
      // than reporting the failure. The server-side sessions are intentionally
      // left alone — they are not ours to end on a forged request.
      clearRefreshCookie(res);
      res.status(204).end();
      return;
    }
  }

  const refreshToken = typeof bodyToken === 'string' && bodyToken.length > 0 ? bodyToken : cookieToken;
  await authService.logout(req.headers.authorization, refreshToken);
  clearRefreshCookie(res);
  res.status(204).end();
});

/**
 * `GET /api/auth/csrf` — hands the current CSRF token to a client that needs to
 * authenticate a cookie-based call but has no token in memory (a page reload).
 *
 * Safe to expose cross-origin in the sense that matters: a third-party page can
 * *trigger* the request, but CORS prevents it from *reading* the response, and the
 * browser will not attach the cookie cross-site under `SameSite=lax` anyway.
 * Returning 401 when there is no usable session is what lets the client tell
 * "signed out" apart from "signed in, needs a token" without a second round trip.
 */
export const csrfHandler = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = readRefreshCookie(req);
  if (!refreshToken || !(await authService.isActiveRefreshToken(refreshToken))) {
    throw unauthenticated('No active session.');
  }
  res.status(200).json({ csrfToken: csrfTokenFor(refreshToken) });
});

export const forgotPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  await authService.requestPasswordReset(email);
  res.status(202).json({});
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body as { token: string; newPassword: string };
  await authService.resetPassword(token, newPassword);
  // The reset killed every session server-side; the browser's copy of the
  // credentials is now worthless and must not be left behind to be replayed.
  clearRefreshCookie(res);
  res.status(204).end();
});