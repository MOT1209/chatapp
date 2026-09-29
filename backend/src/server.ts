import { createApp } from './app.js';
import { createWsServer } from './realtime/ws-server.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info('chatapp-api started', { port: env.PORT, env: env.NODE_ENV });
});

const wss = createWsServer(server);

// Presence is stored in the DB, so a crash leaves stale isOnline=true rows behind.
// No socket can be connected yet at boot, so everyone is offline by definition.
prisma.user
  .updateMany({ where: { isOnline: true }, data: { isOnline: false } })
  .catch((err: unknown) => {
    logger.error('failed to reset presence on boot', { err: err instanceof Error ? err.message : String(err) });
  });

function shutdown(signal: string): void {
  logger.info('shutting down', { signal });
  setTimeout(() => process.exit(1), 10_000).unref();
  // server.close() waits for open connections; WebSockets never end on their own.
  for (const client of wss.clients) {
    client.close(1001, 'server shutting down');
  }
  wss.close();
  server.close(() => {
    prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', { err: reason instanceof Error ? reason.message : String(reason) });
});
