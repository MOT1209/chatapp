// Opaque pagination cursor for GET /api/conversations/:id/messages.
// The frontend treats this as an unparseable string (docs/api-contract.md §3.3),
// so any encoding works as long as encode/decode round-trip.

type MessageCursor = {
  id: string;
  createdAt: string; // ISO 8601
};

export function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): MessageCursor | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as MessageCursor).id === 'string' &&
      typeof (parsed as MessageCursor).createdAt === 'string'
    ) {
      return parsed as MessageCursor;
    }
    return null;
  } catch {
    return null;
  }
}
