import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { validationError } from '../lib/errors.js';

/** Zod's flatten().fieldErrors is string[] per field; the contract wants one string. */
function firstMessagePerField(fieldErrors: Record<string, string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      out[field] = messages[0] as string;
    }
  }
  return out;
}

/** Validates and replaces req.body with the parsed (and coerced) value. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(validationError(firstMessagePerField(result.error.flatten().fieldErrors)));
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Validates req.query the same way, without mutating it (Express 4 getter-only in some setups). */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(validationError(firstMessagePerField(result.error.flatten().fieldErrors)));
      return;
    }
    res.locals.query = result.data;
    next();
  };
}
