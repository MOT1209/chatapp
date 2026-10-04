import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * Liveness probe (repair brief §10): cheap, no database access. Answers "is
 * the process up?" — a load balancer uses it to stop routing to a wedged
 * process without adding a DB query to every probe.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'chatapp-api',
  });
});

/**
 * Readiness probe (repair brief §10): 200 only when the application is alive
 * AND the database is reachable; 503 when the process runs but the database
 * is unavailable. A deliberately minimal round-trip — `SELECT 1` touches no
 * tables — so probing is safe at a high frequency.
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      service: 'chatapp-api',
      checks: { database: 'up' },
    });
  } catch (err) {
    // Log the failure type only, never the connection string or error text —
    // Prisma initialization errors embed DATABASE_URL (contract §6.6 log rules).
    logger.warn('readiness check failed: database unreachable', {
      err: err instanceof Error ? err.name : 'unknown',
    });
    res.status(503).json({
      status: 'degraded',
      service: 'chatapp-api',
      checks: { database: 'down' },
    });
  }
});

export default router;
