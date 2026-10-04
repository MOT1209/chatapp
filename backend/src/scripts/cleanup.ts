// CLI entrypoint for the session/reset-token cleanup job (repair brief §11).
//
// Run it from a scheduler — e.g. daily:
//   npm run cleanup
//
// One invocation performs ONE bounded pass; it does not loop or daemonize.
// It is idempotent, so overlapping runs are harmless. Retention and batch
// size are configured through environment variables (see .env.example):
//   CLEANUP_BATCH_SIZE            (default 500)
//   SESSION_RETENTION_DAYS        (default 30)   revoked sessions older than this
//   RESET_TOKEN_RETENTION_DAYS    (default 30)   used reset tokens older than this
// Rows that are expired outright are always deleted regardless of retention.
//
// `--dry-run` counts what would be deleted without touching anything.

import { cleanupExpiredRecords, cleanupTotal } from '../services/maintenance.service.js';
import { env } from '../config/env.js';

const dryRun = process.argv.includes('--dry-run');

// Budgets are read from the validated environment (src/config/env.ts) rather than
// from process.env directly, so a bad value fails at startup with a clear message
// instead of silently becoming NaN mid-job. This header used to document three
// variables that existed in no schema at all, which meant an operator could set
// them and watch them be ignored.
const config = {
  batchSize: env.CLEANUP_BATCH_SIZE,
  sessionRetentionDays: env.SESSION_RETENTION_DAYS,
  resetTokenRetentionDays: env.RESET_TOKEN_RETENTION_DAYS,
};

try {
  const result = await cleanupExpiredRecords({ dryRun, ...config });
  console.log(
    JSON.stringify({
      job: 'cleanup',
      config,
      total: cleanupTotal(result),
      // `dryRun` is carried by `...result`; it must not be repeated above.
      ...result,
    }),
  );
  process.exit(0);
} catch (err) {
  // Never log environment details here — a failure may carry DATABASE_URL.
  console.error(
    JSON.stringify({
      job: 'cleanup',
      ok: false,
      err: err instanceof Error ? err.name : 'unknown',
    }),
  );
  process.exit(1);
}
