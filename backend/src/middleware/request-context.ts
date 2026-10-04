import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Request ID + timing middleware (repair brief §17).
 *
 * Every HTTP request gets an ID: taken from an inbound `X-Request-Id` when it
 * looks sane (so a gateway can correlate across services), otherwise a fresh
 * UUID. The same ID is:
 * - returned to the caller in the `X-Request-Id` response header, and
 * - included in the structured log line for the request, so a user-reported
 *   problem can be traced to exactly one log entry.
 *
 * Request bodies are never logged — they carry passwords, tokens and message
 * text. The log line carries method, route *pattern* (never the query string:
 * it could embed whatever the caller put there), status and duration.
 */
export function requestContext(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();

    res.setHeader('X-Request-Id', requestId);
    res.locals.requestId = requestId;

    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
      // req.route exists only for matched routes; for 404s fall back to the raw
      // path. The query string is deliberately excluded — it must never be able
      // to smuggle credentials into the logs.
      const route = req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : req.path;
      logger.info('http request', {
        requestId,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      });
    });

    next();
  };
}

/**
 * Reads the request's ID (set by `requestContext`); empty string when absent.
 *
 * Defensive on purpose: the error handler calls this while rendering a response,
 * and a bare/mocked response object (unit tests) has no `locals` at all. Returning
 * '' lets the log line omit a meaningless id instead of throwing a *second* error
 * inside the error handler.
 */
export function getRequestId(res: Response): string {
  return (res.locals?.requestId as string | undefined) ?? '';
}
