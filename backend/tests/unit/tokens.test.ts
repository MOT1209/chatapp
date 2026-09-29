import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/lib/tokens.js';
import { ApiError } from '../../src/lib/errors.js';

describe('access tokens', () => {
  it('round-trips the user id', () => {
    const token = signAccessToken('u_1');
    expect(verifyAccessToken(token)).toBe('u_1');
  });

  it('rejects a garbage token as UNAUTHENTICATED', () => {
    expect.assertions(1);
    try {
      verifyAccessToken('not-a-jwt');
    } catch (err) {
      expect((err as ApiError).code).toBe('UNAUTHENTICATED');
    }
  });

  it('maps an expired token to TOKEN_EXPIRED', () => {
    const expired = jwt.sign({ typ: 'access' }, 'test-access-secret', { subject: 'u_1', expiresIn: -10 });
    expect.assertions(1);
    try {
      verifyAccessToken(expired);
    } catch (err) {
      expect((err as ApiError).code).toBe('TOKEN_EXPIRED');
    }
  });

  it('rejects a refresh token used as an access token', () => {
    const { token } = signRefreshToken('u_1');
    expect(() => verifyAccessToken(token)).toThrow(ApiError);
  });
});

describe('refresh tokens', () => {
  it('verifies shape and hashes deterministically', () => {
    const signed = signRefreshToken('u_2');
    expect(verifyRefreshToken(signed.token)).toMatchObject({ userId: 'u_2' });
    expect(signed.hash).toBe(hashToken(signed.token));
    expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('gives each refresh token a distinct jti', () => {
    const a = verifyRefreshToken(signRefreshToken('u_3').token);
    const b = verifyRefreshToken(signRefreshToken('u_3').token);
    expect(a.jti).not.toBe(b.jti);
  });
});
