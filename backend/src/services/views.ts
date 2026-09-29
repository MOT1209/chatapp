/**
 * View assembly.
 *
 * Turns stored records into the contract DTOs the API and WebSocket layers return.
 * A per-request user cache avoids repeatedly loading the same participant, which keeps
 * the conversation list from degrading into an obvious N+1.
 */

import type { AppContext } from '../context.js';
import type { ConversationMemberRecord, ConversationRecord, MessageRecord, UserRecord } from '../data/records.js';
import { ApiError } from '../lib/errors.js';
import {
  serializeMessage,
  serializePublicUser,
  type ConversationDto,
  type MessageDto,
} from '../lib/serialize.js';

export type UserCache = Map<string, UserRecord>;

export function makeUserCache(): UserCache {
  return new Map();
}

async function loadUser(ctx: AppContext, cache: UserCache, id: string): Promise<UserRecord> {
  const cached = cache.get(id);
  if (cached) return cached;
  const user = await ctx.store.findUserById(id);
  if (!user) throw ApiError.notFound('User not found.');
  cache.set(id, user);
  return user;
}

/** In a direct conversation, the read state of a message is the *other* member's lastReadAt. */
function recipientLastReadAt(members: ConversationMemberRecord[], senderId: string): Date | null {
  const recipient = members.find((m) => m.userId !== senderId);
  return recipient?.lastReadAt ?? null;
}

export async function serializeMessageRecord(
  ctx: AppContext,
  message: MessageRecord,
  members: ConversationMemberRecord[],
  cache: UserCache,
): Promise<MessageDto> {
  const sender = await loadUser(ctx, cache, message.senderId);
  return serializeMessage(message, sender, recipientLastReadAt(members, message.senderId));
}

export async function toConversationDto(
  ctx: AppContext,
  conversation: ConversationRecord,
  currentUserId: string,
  cache: UserCache,
): Promise<ConversationDto> {
  const members = await ctx.store.listMembers(conversation.id);
  const otherMember = members.find((m) => m.userId !== currentUserId);
  const currentMember = members.find((m) => m.userId === currentUserId);
  if (!otherMember) {
    // A direct conversation always has two members; a missing one is a data fault.
    throw ApiError.notFound('Conversation not found.');
  }

  const participant = await loadUser(ctx, cache, otherMember.userId);
  const lastMessageRecord = await ctx.store.getLastMessage(conversation.id);
  const lastMessage = lastMessageRecord
    ? await serializeMessageRecord(ctx, lastMessageRecord, members, cache)
    : null;
  const unreadCount = await ctx.store.countUnread(conversation.id, currentUserId, currentMember?.lastReadAt ?? null);

  return {
    id: conversation.id,
    type: 'direct',
    participant: serializePublicUser(participant),
    lastMessage,
    unreadCount,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}
