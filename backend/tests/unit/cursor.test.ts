import { describe, it, expect } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/lib/cursor.js';
import { ApiError } from '../../src/lib/errors.js';

describe('message cursor', () => {
  it('round-trips a boundary', () => {
    const cursor = { createdAt: '2026-01-01T10:00:00.000Z', id: 'm_10' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('is opaque base64url (no raw json punctuation)', () => {
    const encoded = encodeCursor({ createdAt: '2026-01-01T10:00:00.000Z', id: 'm_10' });
    expect(encoded).not.toContain('{');
    expect(encoded).not.toContain('"');
  });

  it('rejects a malformed cursor with VALIDATION_ERROR', () => {
    expect.assertions(1);
    try {
      decodeCursor('!!!not-base64-json!!!');
    } catch (err) {
      expect((err as ApiError).code).toBe('VALIDATION_ERROR');
    }
  });
});
