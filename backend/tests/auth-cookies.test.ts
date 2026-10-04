import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import {
  COOKIE_TRANSPORT_HEADER,
  REFRESH_COOKIE,
  authResponseBody,
  readRefreshCookie,
  wantsCookieTransport,
} from '../src/lib/auth-cookies.js';

function reqWithCookie(header?: string): Request {
  return { headers: header === undefined ? {} : { cookie: header } } as unknown as Request;
}

describe('readRefreshCookie', () => {
  it('returns the value when the cookie is the only one present', () => {
    expect(readRefreshCookie(reqWithCookie(`${REFRESH_COOKIE}=abc123`))).toBe('abc123');
  });

  it('finds its own cookie among several', () => {
    expect(readRefreshCookie(reqWithCookie(`theme=dark; ${REFRESH_COOKIE}=abc123; other=1`))).toBe('abc123');
  });

  it('tolerates the extra spacing browsers add after the semicolon', () => {
    expect(readRefreshCookie(reqWithCookie(`theme=dark;   ${REFRESH_COOKIE}=abc123`))).toBe('abc123');
  });

  it('does not match a cookie whose name merely ends with the same characters', () => {
    expect(readRefreshCookie(reqWithCookie(`not_${REFRESH_COOKIE}=abc123`))).toBeUndefined();
  });

  it('returns undefined when the header is missing entirely', () => {
    expect(readRefreshCookie(reqWithCookie())).toBeUndefined();
  });

  it('returns undefined for an empty cookie value, so a logout can still clear it', () => {
    expect(readRefreshCookie(reqWithCookie(`${REFRESH_COOKIE}=`))).toBeUndefined();
  });

  it('returns undefined when only unrelated cookies are present', () => {
    expect(readRefreshCookie(reqWithCookie('theme=dark; locale=en'))).toBeUndefined();
  });
});

describe('wantsCookieTransport', () => {
  function reqWithHeader(value?: string | string[]): Request {
    const headers = value === undefined ? {} : { [COOKIE_TRANSPORT_HEADER]: value };
    return { headers } as unknown as Request;
  }

  it('is true for the browser client', () => {
    expect(wantsCookieTransport(reqWithHeader('web'))).toBe(true);
  });

  it('ignores casing and surrounding whitespace, since a proxy may rewrite neither', () => {
    expect(wantsCookieTransport(reqWithHeader('  Web '))).toBe(true);
  });

  it('accepts a repeated header by looking at the first value', () => {
    expect(wantsCookieTransport(reqWithHeader(['web']))).toBe(true);
  });

  it('is false when the header is absent, which keeps every native build on the JSON body', () => {
    expect(wantsCookieTransport(reqWithHeader())).toBe(false);
  });

  it('is false for any other platform value rather than guessing', () => {
    expect(wantsCookieTransport(reqWithHeader('android'))).toBe(false);
    expect(wantsCookieTransport(reqWithHeader(''))).toBe(false);
  });
});

describe('authResponseBody', () => {
  const tokens = { accessToken: 'a1', refreshToken: 'r1' };

  it('omits the refresh token for a browser, so an injected script cannot read it', () => {
    const body = authResponseBody(tokens, 'c1', true);

    expect(body).toEqual({ accessToken: 'a1', csrfToken: 'c1' });
    expect(body).not.toHaveProperty('refreshToken');
    // Serialised, not just absent as a key: nothing may leak it into the payload.
    expect(JSON.stringify(body)).not.toContain('r1');
  });

  it('still returns it for a native client, which has no cookie jar to read', () => {
    expect(authResponseBody(tokens, 'c1', false)).toEqual({
      accessToken: 'a1',
      refreshToken: 'r1',
      csrfToken: 'c1',
    });
  });

  it('carries the CSRF token either way, since the next call needs it', () => {
    expect(authResponseBody(tokens, 'c1', true).csrfToken).toBe('c1');
    expect(authResponseBody(tokens, 'c1', false).csrfToken).toBe('c1');
  });
});