/**
 * Application error type and the contract error codes.
 *
 * Every failure the API surfaces is an `ApiError`. The error middleware turns it into
 * the exact envelope docs/api-contract.md §1.1 defines:
 *   { "error": { "code", "message", "fields"? } }
 */

import type { RequestHandler } from 'express';

/** Machine-readable codes from docs/api-contract.md §1.2. Shared with the WS layer. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  /** Seconds to send in a `Retry-After` header, only for RATE_LIMITED. */
  readonly retryAfter?: number;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { fields?: Record<string, string>; retryAfter?: number },
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fields = options?.fields;
    this.retryAfter = options?.retryAfter;
  }

  static validation(fields: Record<string, string>, message = 'Validation failed.'): ApiError {
    return new ApiError('VALIDATION_ERROR', message, { fields });
  }

  static unauthenticated(message = 'Authentication is required.'): ApiError {
    return new ApiError('UNAUTHENTICATED', message);
  }

  static tokenExpired(message = 'The access token has expired.'): ApiError {
    return new ApiError('TOKEN_EXPIRED', message);
  }

  static forbidden(message = 'You do not have access to this resource.'): ApiError {
    return new ApiError('FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found.'): ApiError {
    return new ApiError('NOT_FOUND', message);
  }

  static conflict(message: string, fields?: Record<string, string>): ApiError {
    return new ApiError('CONFLICT', message, { fields });
  }

  static rateLimited(retryAfter: number, message = 'Too many requests. Please slow down.'): ApiError {
    return new ApiError('RATE_LIMITED', message, { retryAfter });
  }
}

/** Wraps an async route handler so a rejected promise reaches the error middleware. */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
