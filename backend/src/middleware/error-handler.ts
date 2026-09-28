import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      fields: err.flatten().fieldErrors,
    });
    return;
  }

  logger.error('Unhandled error', { err: err instanceof Error ? err.message : String(err) });

  res.status(500).json({ error: 'INTERNAL_ERROR' });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND' });
}
