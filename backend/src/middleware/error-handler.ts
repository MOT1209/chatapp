/**
 * Error and 404 middleware.
 *
 * Every failure leaves the API as the envelope from docs/api-contract.md §1.1:
 *   { "error": { "code", "message", "fields"? } }
 * A raw ZodError is mapped to VALIDATION_ERROR; anything unrecognised becomes a
 * SERVER_ERROR with a safe generic message, and the real cause is logged, never leaked.
 */

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError, type ErrorCode } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}

function envelope(code: ErrorCode, message: string, fields?: Record<string, string>): ErrorEnvelope {
  return { error: fields ? { code, message, fields } : { code, message } };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ApiError) {
    if (err.code === 'RATE_LIMITED' && err.retryAfter) {
      res.setHeader('Retry-After', String(err.retryAfter));
    }
    res.status(err.status).json(envelope(err.code, err.message, err.fields));
    return;
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !(key in fields)) fields[key] = issue.message;
    }
    res.status(400).json(envelope('VALIDATION_ERROR', 'Validation failed.', fields));
    return;
  }

  logger.error('Unhandled error', { err: err instanceof Error ? err.stack ?? err.message : String(err) });
  res.status(500).json(envelope('SERVER_ERROR', 'Something went wrong. Please try again.'));
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(envelope('NOT_FOUND', 'Resource not found.'));
}
