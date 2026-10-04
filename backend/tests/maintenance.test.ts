import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanupExpiredRecords, cleanupTotal, type CleanupResult } from '../src/services/maintenance.service.js';
import * as authService from '../src/services/auth.service.js';

/**
 * Repair brief §11: safe cleanup for expired sessions and reset tokens.
 * Pin the retention rules (expired → gone; revoked/used → kept until the
 * retention horizon passes; fresh → untouched) and idempotence (a second pass
 * deletes nothing).
 */
let app: ReturnType<typeof buildTestApp>;

beforeAll(() => {
  app = buildTestApp();
});

afterEach(async () => {
  await resetDb();
});

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedSessions(userId: string): Promise<void> {
  const rows = [
    // 1: fresh, live session — must survive.
    { refreshHash: 'sess-live', expiresAt: new Date(Date.now() + 10 * DAY_MS), revokedAt: null },
    // 2: expired — delete.
    { refreshHash: 'sess-expired', expiresAt: new Date(Date.now() - 1_000), revokedAt: null },
    // 3: revoked long ago (past retention) but not yet expired — delete.
    { refreshHash: 'sess-revoked-old', expiresAt: new Date(Date.now() + 10 * DAY_MS), revokedAt: new Date(Date.now() - 40 * DAY_MS) },
    // 4: revoked recently (inside retention) — keep.
    { refreshHash: 'sess-revoked-recent', expiresAt: new Date(Date.now() + 10 * DAY_MS), revokedAt: new Date(Date.now() - 2 * DAY_MS) },
  ];
  for (const row of rows) {
    await prisma.session.create({ data: { userId, ...row } });
  }
}

async function seedResetTokens(userId: string): Promise<void> {
  const rows = [
    // 1: fresh, live token — must survive.
    { tokenHash: 'tok-live', expiresAt: new Date(Date.now() + 3600_000), usedAt: null },
    // 2: expired, unused — delete.
    { tokenHash: 'tok-expired', expiresAt: new Date(Date.now() - 1_000), usedAt: null },
    // 3: used long ago (past retention) — delete.
    { tokenHash: 'tok-used-old', expiresAt: new Date(Date.now() + 3600_000), usedAt: new Date(Date.now() - 40 * DAY_MS) },
    // 4: used recently (inside retention) — keep.
    { tokenHash: 'tok-used-recent', expiresAt: new Date(Date.now() + 3600_000), usedAt: new Date(Date.now() - 1 * DAY_MS) },
  ];
  for (const row of rows) {
    await prisma.passwordResetToken.create({ data: { userId, ...row } });
  }
}

describe('cleanupExpiredRecords', () => {
  it('deletes expired sessions, old revoked sessions, expired and old used reset tokens — and nothing else', async () => {
    const user = await registerUser(app, { email: 'cleanup@example.com' });
    await seedSessions(user.user.id);
    await seedResetTokens(user.user.id);

    const result = await cleanupExpiredRecords({});

    expect(result).toEqual<CleanupResult>({
      expiredSessionsDeleted: 1,
      revokedSessionsDeleted: 1,
      expiredResetTokensDeleted: 1,
      usedResetTokensDeleted: 1,
      dryRun: false,
    });

    // Scope to the seeded rows (registerUser also creates one real session).
    const remainingSessions = await prisma.session.findMany({ where: { refreshHash: { startsWith: 'sess-' } }, select: { refreshHash: true } });
    expect(remainingSessions.map((s) => s.refreshHash).sort()).toEqual(['sess-live', 'sess-revoked-recent']);

    const remainingTokens = await prisma.passwordResetToken.findMany({ select: { tokenHash: true } });
    expect(remainingTokens.map((t) => t.tokenHash).sort()).toEqual(['tok-live', 'tok-used-recent']);
  });

  it('is idempotent: a second pass immediately after deletes nothing', async () => {
    const user = await registerUser(app, { email: 'idempotent@example.com' });
    await seedSessions(user.user.id);
    await seedResetTokens(user.user.id);

    await cleanupExpiredRecords({});
    const second = await cleanupExpiredRecords({});

    expect(cleanupTotal(second)).toBe(0);
  });

  it('never touches rows created by the live auth flow', async () => {
    // Register creates one live session; requestPasswordReset creates one live token.
    const user = await registerUser(app, { email: 'liveflow@example.com' });
    await authService.requestPasswordReset('liveflow@example.com');

    const result = await cleanupExpiredRecords({});
    expect(cleanupTotal(result)).toBe(0);

    expect(await prisma.session.count({ where: { userId: user.user.id } })).toBe(1);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.user.id } })).toBe(1);
  });

  it('dry-run counts candidates without deleting anything', async () => {
    const user = await registerUser(app, { email: 'dryrun@example.com' });
    await seedSessions(user.user.id);
    await seedResetTokens(user.user.id);

    const result = await cleanupExpiredRecords({ dryRun: true });
    expect(cleanupTotal(result)).toBe(4);

    // Scope to the seeded rows (registerUser also creates one real session).
    expect(await prisma.session.count({ where: { refreshHash: { startsWith: 'sess-' } } })).toBe(4);
    expect(await prisma.passwordResetToken.count({ where: { tokenHash: { startsWith: 'tok-' } } })).toBe(4);
  });

  it('drains a backlog larger than one batch across batches', async () => {
    const user = await registerUser(app, { email: 'backlog@example.com' });
    const total = 37; // deliberately not a multiple of the batch size below
    for (let i = 0; i < total; i += 1) {
      await prisma.passwordResetToken.create({
        data: {
          userId: user.user.id,
          tokenHash: `backlog-${i}`,
          expiresAt: new Date(Date.now() - 1_000),
        },
      });
    }

    const result = await cleanupExpiredRecords({ batchSize: 10 });
    expect(result.expiredResetTokensDeleted).toBe(total);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.user.id } })).toBe(0);
  });
});
