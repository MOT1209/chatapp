/**
 * Authentication logic (docs/api-contract.md §3.1).
 *
 * Covers register, login, refresh with rotation + reuse detection, logout, and the
 * password-reset pair. Login returns one generic INVALID_CREDENTIALS for both unknown
 * user and wrong password, and runs a dummy hash compare when the user is missing so
 * the two paths take similar time.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { AppContext } from '../context.js';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/tokens.js';
import { serializeSelfUser, type SelfUserDto } from '../lib/serialize.js';

/** A valid bcrypt hash of a random value, used to equalise timing on unknown users. */
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Dq2Fed5rXfBEHfL0/2rXQ0hE9G8W';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface AuthTokens {
  user: SelfUserDto;
  accessToken: string;
  refreshToken: string;
}

interface RequestMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

async function issueSession(ctx: AppContext, userId: string, meta: RequestMeta) {
  const refresh = signRefreshToken(userId);
  await ctx.store.createSession({
    userId,
    refreshHash: refresh.hash,
    expiresAt: refresh.expiresAt,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
  });
  return { accessToken: signAccessToken(userId), refreshToken: refresh.token };
}

export async function register(
  ctx: AppContext,
  input: { username: string; email: string; password: string; displayName: string },
  meta: RequestMeta = {},
): Promise<AuthTokens> {
  const passwordHash = await hashPassword(input.password);
  const user = await ctx.store.createUser({
    email: input.email,
    username: input.username,
    displayName: input.displayName,
    passwordHash,
  });
  const tokens = await issueSession(ctx, user.id, meta);
  return { user: serializeSelfUser(user), ...tokens };
}

export async function login(
  ctx: AppContext,
  input: { identifier: string; password: string },
  meta: RequestMeta = {},
): Promise<AuthTokens> {
  const user = await ctx.store.findUserByIdentifier(input.identifier);
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new ApiError('INVALID_CREDENTIALS', 'Incorrect username or password.', {
      fields: { password: 'Incorrect username or password.' },
    });
  }
  const tokens = await issueSession(ctx, user.id, meta);
  return { user: serializeSelfUser(user), ...tokens };
}

export async function refresh(
  ctx: AppContext,
  refreshToken: string,
  meta: RequestMeta = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  const { userId } = verifyRefreshToken(refreshToken);
  const session = await ctx.store.findSessionByRefreshHash(hashToken(refreshToken));

  if (!session) {
    throw ApiError.unauthenticated('The refresh token is invalid or expired.');
  }
  if (session.revokedAt) {
    // A rotated token being replayed means it may be stolen: drop every session.
    await ctx.store.revokeAllSessions(session.userId);
    throw ApiError.unauthenticated('The refresh token has been revoked.');
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthenticated('The refresh token is invalid or expired.');
  }

  // Rotate: the presented token is retired and a fresh pair is issued.
  await ctx.store.revokeSession(session.id);
  return issueSession(ctx, userId, meta);
}

/** Best-effort logout: revokes every session for the user (signs them out everywhere). */
export async function logout(ctx: AppContext, userId: string): Promise<void> {
  await ctx.store.revokeAllSessions(userId);
}

export async function forgotPassword(ctx: AppContext, email: string): Promise<void> {
  const user = await ctx.store.findUserByEmail(email);
  if (!user) {
    // Same outcome whether or not the address exists (no account enumeration).
    return;
  }
  const rawToken = randomBytes(32).toString('base64url');
  await ctx.store.createPasswordReset({
    userId: user.id,
    tokenHash: createHash('sha256').update(rawToken).digest('hex'),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  // No email provider in Alpha. In development the raw token is logged so the flow can
  // be exercised; in production it is never logged (Post-Alpha: send it by email).
  if (env.NODE_ENV !== 'production') {
    logger.info('password reset requested (dev only)', { email: user.email, resetToken: rawToken });
  }
}

export async function resetPassword(ctx: AppContext, token: string, newPassword: string): Promise<void> {
  const record = await ctx.store.findPasswordReset(createHash('sha256').update(token).digest('hex'));
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw ApiError.validation({ token: 'This reset link is invalid or has expired.' });
  }
  await ctx.store.updateUserPassword(record.userId, await hashPassword(newPassword));
  await ctx.store.markPasswordResetUsed(record.id);
  // Changing the password invalidates every existing session.
  await ctx.store.revokeAllSessions(record.userId);
}
