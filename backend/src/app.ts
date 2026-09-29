import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import type { AppContext } from './context.js';
import healthRouter from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createUsersRouter } from './routes/users.js';
import { createConversationsRouter } from './routes/conversations.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export function createApp(ctx: AppContext): Express {
  const app = express();

  // Trust the first proxy hop so `req.ip` is the real client behind a reverse proxy.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);
  app.use('/api/auth', createAuthRouter(ctx));
  app.use('/api/users', createUsersRouter(ctx));
  app.use('/api/conversations', createConversationsRouter(ctx));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
