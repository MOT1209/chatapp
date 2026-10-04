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

const dryRun = process.argv.includes('--dry-run');

try {
  const result = await cleanupExpiredRecords({ dryRun });
  console.log(
    JSON.stringify({
      job: 'cleanup',
      total: cleanupTotal(result),
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
