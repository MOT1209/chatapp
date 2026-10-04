import { prisma } from '../lib/prisma.js';

/**
 * Safe cleanup of expired database records (repair brief §11).
 *
 * Rows that only exist for security bookkeeping — expired refresh sessions,
 * expired/used password-reset tokens — are never read again once past their
 * useful life, but until now they accumulated forever. This job deletes them
 * under rules that make it safe to run on a live service:
 *
 * - **Idempotent:** running it twice (or concurrently) changes nothing the
 *   second time — every rule is a pure function of "is this row past its
 *   retention horizon".
 * - **Batched:** rows are deleted in bounded chunks, so a large backlog cannot
 *   turn into one huge transaction that pins locks and bloats the WAL.
 * - **Conservative:** only rows that are already unusable are touched. A
 *   session is deleted only once `expiresAt` has passed (Prisma/Express already
 *   reject it) or it was revoked long enough ago; a reset token only once
 *   expired or used and past retention. Active rows are never candidates.
 *
 * Retention is configurable (see .env.example); the defaults keep enough
 * history to investigate incidents after the fact.
 */

export type CleanupOptions = {
  /** Max rows deleted per statement batch. Bounded so no single DELETE is huge. */
  batchSize?: number;
  /** Revoked (but not expired) sessions are deleted after this many days. Default 30. */
  sessionRetentionDays?: number;
  /** Used reset tokens are deleted after this many days. Default 30. */
  resetTokenRetentionDays?: number;
  /** Count what *would* be deleted without deleting anything. */
  dryRun?: boolean;
};

export type CleanupResult = {
  expiredSessionsDeleted: number;
  revokedSessionsDeleted: number;
  expiredResetTokensDeleted: number;
  usedResetTokensDeleted: number;
  dryRun: boolean;
};

/** Deletes `ids` in chunks of at most `batchSize`, returning the total. */
async function deleteInBatches(model: 'session' | 'passwordResetToken', ids: string[], batchSize: number): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    if (model === 'session') {
      const res = await prisma.session.deleteMany({ where: { id: { in: chunk } } });
      deleted += res.count;
    } else {
      const res = await prisma.passwordResetToken.deleteMany({ where: { id: { in: chunk } } });
      deleted += res.count;
    }
  }
  return deleted;
}

/** Collects up to `take` ids matching `where`, in deterministic id order. */
async function findIds(model: 'session' | 'passwordResetToken', where: Record<string, unknown>, take: number): Promise<string[]> {
  const rows =
    model === 'session'
      ? await prisma.session.findMany({ where, select: { id: true }, orderBy: { id: 'asc' }, take })
      : await prisma.passwordResetToken.findMany({ where, select: { id: true }, orderBy: { id: 'asc' }, take });
  return rows.map((row) => row.id);
}

/**
 * Runs one cleanup pass. Designed to be invoked by a scheduler (cron,
 * systemd timer, platform job) — typically once per day. It is NOT an
 * aggressive loop: one pass deletes at most a bounded amount per rule batch
 * and returns; the scheduler decides the cadence. Repeat calls are safe.
 */
export async function cleanupExpiredRecords(options: CleanupOptions = {}): Promise<CleanupResult> {
  const batchSize = options.batchSize ?? 500;
  const sessionRetentionDays = options.sessionRetentionDays ?? 30;
  const resetTokenRetentionDays = options.resetTokenRetentionDays ?? 30;
  const now = new Date();
  const sessionRetentionCutoff = new Date(now.getTime() - sessionRetentionDays * 24 * 60 * 60 * 1000);
  const resetTokenRetentionCutoff = new Date(now.getTime() - resetTokenRetentionDays * 24 * 60 * 60 * 1000);

  // A backlog larger than one batch is drained across consecutive runs of this
  // same pass: each rule loops until a query comes back short. Bounded per
  // statement, so normal traffic never waits behind a giant DELETE.
  const MAX_PASSES = 20; // hard cap: even a huge backlog cannot make one call unbounded

  async function drain(model: 'session' | 'passwordResetToken', where: Record<string, unknown>): Promise<number> {
    if (options.dryRun) {
      return model === 'session'
        ? await prisma.session.count({ where })
        : await prisma.passwordResetToken.count({ where });
    }
    let total = 0;
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const ids = await findIds(model, where, batchSize);
      if (ids.length === 0) {
        break;
      }
      total += await deleteInBatches(model, ids, batchSize);
      if (ids.length < batchSize) {
        break;
      }
    }
    return total;
  }

  const expiredSessionsDeleted = await drain('session', { expiresAt: { lt: now } });
  const revokedSessionsDeleted = await drain('session', { revokedAt: { lt: sessionRetentionCutoff }, expiresAt: { gte: now } });
  const expiredResetTokensDeleted = await drain('passwordResetToken', { expiresAt: { lt: now } });
  const usedResetTokensDeleted = await drain('passwordResetToken', { usedAt: { lt: resetTokenRetentionCutoff }, expiresAt: { gte: now } });

  return {
    expiredSessionsDeleted,
    revokedSessionsDeleted,
    expiredResetTokensDeleted,
    usedResetTokensDeleted,
    dryRun: options.dryRun ?? false,
  };
}

/** Total work done — used by the CLI output and tests to assert idempotence. */
export function cleanupTotal(result: CleanupResult): number {
  return (
    result.expiredSessionsDeleted +
    result.revokedSessionsDeleted +
    result.expiredResetTokensDeleted +
    result.usedResetTokensDeleted
  );
}
