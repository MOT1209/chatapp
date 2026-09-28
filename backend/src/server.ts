import { createApp } from './app.js';
import { createWsServer } from './realtime/ws-server.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info('chatapp-api started', { port: env.PORT, env: env.NODE_ENV });
});

createWsServer(server);

function shutdown(signal: string): void {
  logger.info('shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
