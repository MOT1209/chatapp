/**
 * Conversation logic (docs/api-contract.md §3.3).
 *
 * Direct conversations are unique per user pair and creation is idempotent: a second
 * "start chat" returns the existing conversation instead of a duplicate. Reads require
 * membership, and a non-member (or unknown id) gets NOT_FOUND, never a leak that the
 * conversation exists.
 */

import type { AppContext } from '../context.js';
import { ApiError } from '../lib/errors.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import type { ConversationDto, MessageDto } from '../lib/serialize.js';
import { makeUserCache, serializeMessageRecord, toConversationDto } from './views.js';

export async function createDirectConversation(
  ctx: AppContext,
  currentUserId: string,
  participantId: string,
): Promise<ConversationDto> {
  if (participantId === currentUserId) {
    throw ApiError.validation({ participantId: 'You cannot start a conversation with yourself.' });
  }
  const participant = await ctx.store.findUserById(participantId);
  if (!participant) {
    throw ApiError.notFound('That user does not exist.');
  }

  const existing = await ctx.store.findDirectConversation(currentUserId, participantId);
  const conversation = existing ?? (await ctx.store.createDirectConversation(currentUserId, participantId));
  return toConversationDto(ctx, conversation, currentUserId, makeUserCache());
}

export async function listConversations(ctx: AppContext, currentUserId: string): Promise<ConversationDto[]> {
  const conversations = await ctx.store.listConversationsForUser(currentUserId);
  const cache = makeUserCache();
  const result: ConversationDto[] = [];
  for (const conversation of conversations) {
    result.push(await toConversationDto(ctx, conversation, currentUserId, cache));
  }
  return result;
}

/** Asserts the conversation exists and the caller is a member, or throws NOT_FOUND. */
export async function assertMembership(ctx: AppContext, conversationId: string, userId: string): Promise<void> {
  const member = await ctx.store.findMember(conversationId, userId);
  if (!member) {
    throw ApiError.notFound('Conversation not found.');
  }
}

export async function getMessages(
  ctx: AppContext,
  currentUserId: string,
  conversationId: string,
  options: { cursor?: string; limit: number },
): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
  await assertMembership(ctx, conversationId, currentUserId);

  const before = options.cursor
    ? (() => {
        const c = decodeCursor(options.cursor!);
        return { createdAt: new Date(c.createdAt), id: c.id };
      })()
    : undefined;

  const members = await ctx.store.listMembers(conversationId);
  // Newest-first from the store; reversed to oldest→newest for the response body.
  const rows = await ctx.store.listMessages({ conversationId, before, limit: options.limit });
  const hasMore = rows.length === options.limit;
  const oldest = rows[rows.length - 1];
  const nextCursor = hasMore && oldest ? encodeCursor({ createdAt: oldest.createdAt.toISOString(), id: oldest.id }) : null;

  const cache = makeUserCache();
  const ordered = [...rows].reverse();
  const messages: MessageDto[] = [];
  for (const row of ordered) {
    messages.push(await serializeMessageRecord(ctx, row, members, cache));
  }
  return { messages, nextCursor };
}
