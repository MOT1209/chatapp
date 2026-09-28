import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

// A single client for the process. Vitest runs each test file in its own worker,
// so this is still one client per worker, not one per test.
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
