// Error codes and envelope from docs/api-contract.md §1.1-1.2.
// Every non-2xx response the API sends must use AppError -> errorHandler, so the
// wire shape stays in exactly one place.

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

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: Record<string, string> | undefined;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fields = fields;
  }

  toBody(): { error: { code: ErrorCode; message: string; fields?: Record<string, string> } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    };
  }
}

export function validationError(fields: Record<string, string>, message = 'Validation failed.'): AppError {
  return new AppError('VALIDATION_ERROR', message, fields);
}

export function invalidCredentials(): AppError {
  return new AppError('INVALID_CREDENTIALS', 'Incorrect username or password.');
}

export function unauthenticated(message = 'Authentication required.'): AppError {
  return new AppError('UNAUTHENTICATED', message);
}

export function tokenExpired(): AppError {
  return new AppError('TOKEN_EXPIRED', 'Access token expired.');
}

export function forbidden(message = 'You are not allowed to do this.'): AppError {
  return new AppError('FORBIDDEN', message);
}

export function notFound(message = 'Resource not found.'): AppError {
  return new AppError('NOT_FOUND', message);
}

export function conflict(message: string, fields?: Record<string, string>): AppError {
  return new AppError('CONFLICT', message, fields);
}

export function rateLimited(message = 'Too many requests.'): AppError {
  return new AppError('RATE_LIMITED', message);
}
