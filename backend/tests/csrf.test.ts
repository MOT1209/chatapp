import { describe, expect, it } from 'vitest';
import { csrfMatches, csrfTokenFor } from '../src/lib/csrf.js';

describe('csrfTokenFor', () => {
  it('is deterministic for the same refresh token, so a client can keep it', () => {
    expect(csrfTokenFor('token-a')).toBe(csrfTokenFor('token-a'));
  });

  it('differs for a different refresh token, so a rotated session invalidates the old one', () => {
    expect(csrfTokenFor('token-a')).not.toBe(csrfTokenFor('token-b'));
  });

  it('returns a hex digest long enough to resist guessing', () => {
    expect(csrfTokenFor('token-a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never reveals the refresh token it was derived from', () => {
    expect(csrfTokenFor('super-secret-refresh')).not.toContain('super-secret-refresh');
  });
});

describe('csrfMatches', () => {
  const expected = csrfTokenFor('refresh-token-x');

  it('accepts the exact token', () => {
    expect(csrfMatches(expected, expected)).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(csrfMatches(expected, undefined)).toBe(false);
  });

  it('rejects an empty header, which an attacker can trivially send', () => {
    expect(csrfMatches(expected, '')).toBe(false);
  });

  it('rejects a token of the right shape but the wrong value', () => {
    expect(csrfMatches(expected, 'f'.repeat(64))).toBe(false);
  });

  it('rejects a token of a different length without throwing', () => {
    expect(csrfMatches(expected, 'abc')).toBe(false);
  });

  it('rejects a non-string header, e.g. a repeated query parameter', () => {
    expect(csrfMatches(expected, 12345)).toBe(false);
  });

  it('rejects the csrf token belonging to a different refresh token', () => {
    const other = csrfTokenFor('refresh-token-y');
    expect(csrfMatches(expected, other)).toBe(false);
  });
});