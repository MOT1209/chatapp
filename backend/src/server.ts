import { createServer } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import type { AppContext } from './context.js';
import type { DataStore } from './data/store.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { PrismaStore } from './data/prisma-store.js';
import { MemoryStore } from './data/memory-store.js';
import { ConnectionHub } from './realtime/hub.js';
import { attachRealtime } from './realtime/server.js';

let prisma: PrismaClient | null = null;
let store: DataStore;
if (env.STORE === 'memory') {
  logger.warn('starting with the in-memory store — data is not persisted');
  store = new MemoryStore();
} else {
  prisma = new PrismaClient();
  store = new PrismaStore(prisma);
}

const hub = new ConnectionHub();
const ctx: AppContext = { store, realtime: hub };

const app = createApp(ctx);
const server = createServer(app);
attachRealtime(server, ctx, hub);

server.listen(env.PORT, () => {
  logger.info('chatapp-api started', { port: env.PORT, env: env.NODE_ENV, store: env.STORE });
});

function shutdown(signal: string): void {
  logger.info('shutting down', { signal });
  server.close(() => {
    void (prisma ? prisma.$disconnect() : Promise.resolve()).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
