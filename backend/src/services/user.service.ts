import { prisma } from '../lib/prisma.js';
import { notFound, validationError } from '../lib/errors.js';
import { serializeUser, type UserDTO } from '../lib/serializers.js';
import { isUniqueConstraintError } from '../lib/prisma-errors.js';

export async function getMe(userId: string): Promise<UserDTO> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    // The access token was valid but the row is gone (should not happen in practice).
    throw notFound('User not found.');
  }
  return serializeUser(user, { includeEmail: true });
}

export async function getById(id: string): Promise<UserDTO> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw notFound('User not found.');
  }
  return serializeUser(user);
}

/** Prisma passes `contains` values into LIKE unescaped, so `%` and `_` would act as wildcards. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function search(currentUserId: string, rawQuery: string, limit: number): Promise<UserDTO[]> {
  const query = escapeLike(rawQuery);
  const users = await prisma.user.findMany({
    where: {
      id: { not: currentUserId },
      OR: [
        { username: { contains: query, mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { username: 'asc' },
    take: limit,
  });
  return users.map((u) => serializeUser(u));
}

export type UpdateProfileInput = {
  displayName?: string;
  avatarUrl?: string | null;
};

export async function updateMe(userId: string, input: UpdateProfileInput): Promise<UserDTO> {
  if (input.displayName === undefined && input.avatarUrl === undefined) {
    throw validationError({ _: 'At least one field is required.' });
  }
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
    });
    return serializeUser(user, { includeEmail: true });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw validationError({ _: 'Could not update profile.' });
    }
    throw err;
  }
}
