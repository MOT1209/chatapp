import { prisma } from '../lib/prisma.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../lib/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiryDate,
  signAccessToken,
  verifyAccessToken,
} from '../lib/jwt.js';
import { conflict, invalidCredentials, unauthenticated, validationError } from '../lib/errors.js';
import { serializeUser, type UserDTO } from '../lib/serializers.js';
import { isUniqueConstraintError } from '../lib/prisma-errors.js';
import { env } from '../config/env.js';
import { wsHub } from '../realtime/ws-hub.js';
import { sendPasswordResetEmail } from './email.service.js';
import crypto from 'node:crypto';

export type AuthTokens = { accessToken: string; refreshToken: string };
export type SessionMeta = { userAgent?: string; ipAddress?: string };

async function issueSession(userId: string, meta: SessionMeta): Promise<AuthTokens> {
  const refreshToken = generateRefreshToken();
  await prisma.session.create({
    data: {
      userId,
      refreshHash: hashRefreshToken(refreshToken),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: refreshTokenExpiryDate(),
    },
  });
  return { accessToken: signAccessToken(userId), refreshToken };
}

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
  displayName: string;
};

export async function register(
  input: RegisterInput,
  meta: SessionMeta,
): Promise<{ user: UserDTO } & AuthTokens> {
  const username = input.username.toLowerCase();
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true, email: true },
  });
  if (existing) {
    const fields: Record<string, string> = {};
    if (existing.username === username) {
      fields.username = 'This username is already taken.';
    }
    if (existing.email === email) {
      fields.email = 'This email is already registered.';
    }
    throw conflict('Username or email already in use.', fields);
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: { username, email, passwordHash, displayName: input.displayName },
    });
    const tokens = await issueSession(user.id, meta);
    return { user: serializeUser(user, { includeEmail: true }), ...tokens };
  } catch (err) {
    // Race: two requests registered the same username/email between the check above
    // and the insert. Report it the same way as the pre-check, not as a 500.
    if (isUniqueConstraintError(err)) {
      throw conflict('Username or email already in use.');
    }
    throw err;
  }
}

export type LoginInput = { identifier: string; password: string };

export async function login(
  input: LoginInput,
  meta: SessionMeta,
): Promise<{ user: UserDTO } & AuthTokens> {
  const identifier = input.identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
  });
  // Same error for "no such user" and "wrong password" — see docs/api-contract.md §3.1,
  // this endpoint must not be usable to enumerate accounts.
  // Always run one bcrypt comparison so response time does not reveal whether
  // the account exists.
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user) {
    throw invalidCredentials();
  }
  if (!valid) {
    throw invalidCredentials();
  }

  const tokens = await issueSession(user.id, meta);
  return { user: serializeUser(user, { includeEmail: true }), ...tokens };
}

/**
 * Whether a refresh token still names a live session. Used by `GET /auth/csrf` to
 * answer "is there a session in this browser?" without rotating anything — a
 * refresh here would burn the very cookie the client is asking about.
 */
export async function isActiveRefreshToken(refreshToken: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { refreshHash: hashRefreshToken(refreshToken) },
    select: { expiresAt: true, revokedAt: true },
  });
  return Boolean(session && !session.revokedAt && session.expiresAt.getTime() >= Date.now());
}

export async function refresh(refreshToken: string, meta: SessionMeta): Promise<AuthTokens> {
  const refreshHash = hashRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({ where: { refreshHash } });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    throw unauthenticated('Refresh token is invalid or expired.');
  }

  if (session.revokedAt) {
    // A rotated-out token showing up again means it was copied (or replayed by a
    // racing client). Kill every session so a thief's freshly issued token dies too.
    await logoutAllSessions(session.userId);
    throw unauthenticated('Refresh token is invalid or expired.');
  }

  // Rotate atomically: only one concurrent caller can flip revokedAt from null.
  const rotated = await prisma.session.updateMany({
    where: { id: session.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (rotated.count !== 1) {
    throw unauthenticated('Refresh token is invalid or expired.');
  }

  return issueSession(session.userId, meta);
}

/**
 * Revokes every active session for a user. Used by logout.
 *
 * The contract's logout request carries no body — just whatever access token the
 * frontend still has — so there is no single refresh token to target. Alpha treats
 * "logout" as "sign out everywhere" rather than tracking per-device sessions.
 */
export async function logoutAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // The credentials are gone; realtime connections must not outlive them.
  wsHub.closeUser(userId, 4401, 'signed out');
}

/** Best-effort: identifies the caller from a bearer token without throwing. */
export function tryIdentifyFromAccessToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  const result = verifyAccessToken(token);
  return result.ok ? result.userId : null;
}

/**
 * Logout that works after the 15-minute access token has expired.
 *
 * The caller may be identified by a still-valid access token, by the refresh
 * token the client also holds, or both. Every identity found has all its
 * sessions revoked (logout = sign out everywhere, see docs/api-contract.md §3.1).
 * An unknown or garbage refresh token identifies no one and is not an error:
 * logout must never block the client.
 */
export async function logout(authorizationHeader: string | undefined, refreshToken: unknown): Promise<void> {
  const userIds = new Set<string>();

  const fromAccessToken = tryIdentifyFromAccessToken(authorizationHeader);
  if (fromAccessToken) {
    userIds.add(fromAccessToken);
  }

  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    const session = await prisma.session.findUnique({
      where: { refreshHash: hashRefreshToken(refreshToken) },
      select: { userId: true },
    });
    if (session) {
      userIds.add(session.userId);
    }
  }

  for (const userId of userIds) {
    await logoutAllSessions(userId);
  }
}

/**
 * Read at call time rather than at import time so a test can drive a cooldown
 * window without reloading the module graph.
 */
function resetTokenTtlMs(): number {
  return env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000;
}

function cooldownMs(): number {
  return env.PASSWORD_RESET_COOLDOWN_SECONDS * 1000;
}

/**
 * True whenever the raw reset token may be surfaced outside the database at
 * all — logged, or handed back to a caller in this process. Production is
 * the only environment where the answer is no. This is deliberately a pure
 * function of NODE_ENV so it can be unit-tested for all three values without
 * needing a live server in a particular env — see tests/auth.test.ts.
 */
export function canExposeRawResetToken(nodeEnv: string): boolean {
  return nodeEnv !== 'production';
}

/**
 * Requests a password reset. Per docs/api-contract.md §3.1 this always
 * "succeeds" from the caller's perspective (§6.6) — the HTTP layer never
 * sees a token either way. The return value exists only for local dev
 * curl-testing and for tests, which need the raw token to drive
 * resetPassword() without an email provider. It is never computed, logged, or returned in
 * production.
 */
export async function requestPasswordReset(email: string): Promise<{ resetToken: string } | void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always succeeds from the caller's perspective — see docs/api-contract.md §3.1,
  // this must not reveal whether the address is registered.
  if (!user) {
    return;
  }

  const window = cooldownMs();
  if (window > 0) {
    // A cooldown is a per-account send limit, not just spam protection: without it
    // `/forgot-password` is an unauthenticated SMTP amplifier that anyone can aim
    // at a third party's inbox, using our reputation and quota.
    const recent = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - window) } },
      select: { id: true },
    });
    if (recent) {
      return;
    }
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // Only the newest link should work: retire any earlier unused ones.
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + resetTokenTtlMs()),
      },
    }),
  ]);

  // Deliver before deciding whether the raw token may be surfaced: development and
  // production use the same path, so a misconfigured mailer is caught here in dev
  // too rather than only after a deploy.
  await sendPasswordResetEmail({
    to: user.email,
    displayName: user.displayName,
    resetToken: rawToken,
    expiresInMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
  });

  if (!canExposeRawResetToken(env.NODE_ENV)) {
    return; // Production: the token exists only as a hash from this point on.
  }

  if (env.NODE_ENV === 'development') {
    // Fallback so the flow stays testable by hand without a mail provider. Never
    // runs in production, and not in test — tests read the token from the return
    // value below instead of scraping stdout.
    console.log(`[dev-only] Password reset token for ${user.email}: ${rawToken}`);
  }

  return { resetToken: rawToken };
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw validationError(
      { token: 'This reset link is invalid or has expired.' },
      'This reset link is invalid or has expired.',
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // A password reset should kill every existing session, stolen or not.
    prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  wsHub.closeUser(record.userId, 4401, 'password reset');
}
