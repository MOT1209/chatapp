import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { securityHeaders } from './middleware/security-headers.js';
import { requestContext } from './middleware/request-context.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  // First middleware: every request — even ones that error out early — gets an
  // X-Request-Id response header and one structured log line (§17).
  app.use(requestContext());
  app.use(securityHeaders());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      // The refresh token now travels in a cookie, so the browser must be allowed
      // to send it — and CORS must read as credentialed, otherwise the response is
      // discarded even when the request succeeds.
      credentials: true,
      // Retry-After is not CORS-safelisted; without this, browsers hide it from the
      // web client and a 429 cannot say how long to wait (contract §1.3).
      exposedHeaders: ['Retry-After'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
