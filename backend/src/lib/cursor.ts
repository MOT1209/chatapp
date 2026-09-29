/**
 * Opaque message pagination cursor.
 *
 * The contract says the cursor is opaque to the client and must not be parsed by hand,
 * so it is a base64url-encoded JSON of the boundary message's createdAt and id. Paging
 * walks backwards in time: each cursor points at the oldest row already returned.
 */

import { ApiError } from './errors.js';

export type MessageCursor = { createdAt: string; id: string };

export function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): MessageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as MessageCursor).createdAt === 'string' &&
      typeof (parsed as MessageCursor).id === 'string' &&
      !Number.isNaN(Date.parse((parsed as MessageCursor).createdAt))
    ) {
      return parsed as MessageCursor;
    }
  } catch {
    // fall through to the validation error
  }
  throw ApiError.validation({ cursor: 'The cursor is invalid.' });
}
