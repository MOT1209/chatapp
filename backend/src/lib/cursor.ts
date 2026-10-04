// Opaque pagination cursors for the API (docs/api-contract.md §3.3/§3.4).
// The frontend treats these as unparseable strings, so any encoding works as
// long as encode/decode round-trip. A cursor names the last row of the
// previous page: pagination resumes strictly after (id, at) in the page's
// sort order, so rows created or updated mid-paging cannot shift the window.
//
// `at` carries the sort timestamp (`createdAt` for messages, `updatedAt` for
// conversations); `id` breaks ties so the order is total.

export type Cursor = {
  id: string;
  at: string; // ISO 8601
};

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as Cursor).id === 'string' &&
      typeof (parsed as Cursor).at === 'string' &&
      // A valid-looking string can still be an unparseable date, which Prisma rejects
      // with an internal error (HTTP 500) instead of the caller's mistake (HTTP 400).
      !Number.isNaN(new Date((parsed as Cursor).at).getTime())
    ) {
      return parsed as Cursor;
    }
    return null;
  } catch {
    return null;
  }
}
