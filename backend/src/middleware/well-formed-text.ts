import type { NextFunction, Request, Response } from 'express';
import { validationError } from '../lib/errors.js';

// Text the database cannot store. PostgreSQL rejects NUL (`\u0000`), and Prisma's query
// engine rejects ill-formed UTF-16 (a lone surrogate, which a client produces when it
// truncates or slices a string through the middle of an emoji). Either one reaches the
// query layer as an internal error, i.e. an HTTP 500 for what is plainly a bad request.
// Refusing it at the boundary turns that into a 400 and keeps every handler unaware of it.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function isUnstorable(text: string): boolean {
  return text.includes('\u0000') || LONE_SURROGATE.test(text);
}

// A real body is a few levels deep at most. The bound only stops a hostile, deeply nested
// document from being walked to the bottom; Zod rejects anything that deep by shape anyway.
const MAX_DEPTH = 32;

export function containsUnstorableText(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') {
    return isUnstorable(value);
  }
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) {
    return false;
  }
  for (const [key, child] of Object.entries(value)) {
    if (isUnstorable(key) || containsUnstorableText(child, depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Rejects a request whose JSON body (keys included) or URL carries text PostgreSQL cannot
 * store. Mounted once, right after the body parser, so it covers every route.
 *
 * The URL is checked for an encoded NUL (`%00`). Other undecodable escapes never reach a
 * handler as ill-formed text: Express answers a bad path escape itself and the query parser
 * leaves an undecodable value as plain ASCII.
 */
export function rejectUnstorableText(req: Request, _res: Response, next: NextFunction): void {
  if (/%00/i.test(req.url) || containsUnstorableText(req.body)) {
    next(validationError({ _: 'Text contains characters that are not allowed.' }));
    return;
  }
  next();
}
