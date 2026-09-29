/**
 * User logic (docs/api-contract.md §3.2).
 *
 * Search excludes the current user and never exposes email addresses; `me` and the
 * profile update return the caller's own record, which does include the email.
 */

import type { AppContext } from '../context.js';
import { ApiError } from '../lib/errors.js';
import {
  serializePublicUser,
  serializeSelfUser,
  type PublicUserDto,
  type SelfUserDto,
} from '../lib/serialize.js';

export async function getMe(ctx: AppContext, userId: string): Promise<SelfUserDto> {
  const user = await ctx.store.findUserById(userId);
  if (!user) throw ApiError.unauthenticated('Your account no longer exists.');
  return serializeSelfUser(user);
}

export async function searchUsers(
  ctx: AppContext,
  currentUserId: string,
  query: string,
  limit: number,
): Promise<PublicUserDto[]> {
  const users = await ctx.store.searchUsers({ query, excludeUserId: currentUserId, limit });
  return users.map(serializePublicUser);
}

export async function getUserById(ctx: AppContext, id: string): Promise<PublicUserDto> {
  const user = await ctx.store.findUserById(id);
  if (!user) throw ApiError.notFound('User not found.');
  return serializePublicUser(user);
}

export async function updateProfile(
  ctx: AppContext,
  userId: string,
  patch: { displayName?: string; avatarUrl?: string | null },
): Promise<SelfUserDto> {
  const user = await ctx.store.updateUser(userId, patch);
  return serializeSelfUser(user);
}
