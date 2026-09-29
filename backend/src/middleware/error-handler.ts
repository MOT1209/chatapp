import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json(err.toBody());
    return;
  }

  // SyntaxError from express.json() on a malformed body.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body.' },
    });
    return;
  }

  logger.error('Unhandled error', describeError(err));

  res.status(500).json({
    error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
}

/**
 * Prisma error messages embed the failing query's arguments (ids, and for message
 * writes potentially the body), so log only their type and code, never the text.
 */
export function describeError(err: unknown): Record<string, unknown> {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientInitializationError
  ) {
    return {
      err: err.name,
      ...('code' in err ? { code: err.code } : {}),
      ...(err instanceof Prisma.PrismaClientKnownRequestError && err.meta?.target ? { target: err.meta.target } : {}),
    };
  }
  return { err: err instanceof Error ? (err.stack ?? err.message) : String(err) };
}
