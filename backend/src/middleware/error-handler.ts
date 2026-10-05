import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getRequestId } from './request-context.js';

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

  // Client errors raised by Express and body-parser themselves (http-errors): a body over
  // the size limit (413), an unsupported content-encoding or charset (415), an undecodable
  // path escape (400), an aborted upload (400). They already carry the right status and are
  // safe to show; without this they all fell through to the 500 below. The code stays
  // VALIDATION_ERROR because that is the closest member of the contract's closed code set.
  const clientError = asExposedClientError(err);
  if (clientError) {
    res.status(clientError.status).json({
      error: { code: 'VALIDATION_ERROR', message: clientError.message },
    });
    return;
  }

  // The request id ties this failure to the request's access log entry (§17).
  // Read defensively: this handler is also invoked directly by unit tests with a
  // bare response object that never went through requestContext().
  logger.error('Unhandled error', { requestId: getRequestId(res), ...describeError(err) });

  res.status(500).json({
    error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' },
  });
}

const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  413: 'Request body is too large.',
  415: 'Unsupported content encoding.',
};

/**
 * Narrow on purpose: only errors that opt in to being shown (`expose`, which http-errors
 * sets for 4xx) and carry a 4xx status. The text is chosen here, never taken from the error.
 */
function asExposedClientError(err: unknown): { status: number; message: string } | null {
  if (typeof err !== 'object' || err === null) {
    return null;
  }
  // Express's own answer to an undecodable percent-escape in a path parameter: a plain
  // URIError that carries status 400 but, not being an http-errors object, no `expose`.
  if (err instanceof URIError) {
    return { status: 400, message: 'Invalid request.' };
  }
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  if (expose !== true || typeof status !== 'number' || !Number.isInteger(status) || status < 400 || status > 499) {
    return null;
  }
  return { status, message: CLIENT_ERROR_MESSAGES[status] ?? 'Invalid request.' };
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
