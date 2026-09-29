/**
 * Messaging logic (docs/api-contract.md §3.4).
 *
 * Sending is idempotent on (conversationId, senderId, clientId): a retry with the same
 * clientId returns the already-stored message (HTTP 200) instead of duplicating it.
 * A new message and a read receipt both fan out over the WebSocket to the conversation
 * members.
 */

import type { AppContext } from '../context.js';
import { ApiError } from '../lib/errors.js';
import type { MessageDto } from '../lib/serialize.js';
import { assertMembership } from './conversation.service.js';
import { makeUserCache, serializeMessageRecord } from './views.js';

export interface SendResult {
  message: MessageDto;
  /** False when an existing message was returned for a duplicate clientId. */
  created: boolean;
}

export async function sendMessage(
  ctx: AppContext,
  currentUserId: string,
  conversationId: string,
  input: { clientId: string; body: string },
): Promise<SendResult> {
  await assertMembership(ctx, conversationId, currentUserId);

  const existing = await ctx.store.findMessageByClientId(conversationId, currentUserId, input.clientId);
  const members = await ctx.store.listMembers(conversationId);
  const cache = makeUserCache();

  if (existing) {
    // Idempotent retry: return the stored message, do not broadcast a second time.
    const message = await serializeMessageRecord(ctx, existing, members, cache);
    return { message, created: false };
  }

  const record = await ctx.store.createMessage({
    conversationId,
    senderId: currentUserId,
    clientId: input.clientId,
    body: input.body,
  });
  // The conversation's ordering key follows its latest message.
  await ctx.store.touchConversation(conversationId, record.createdAt);

  const message = await serializeMessageRecord(ctx, record, members, cache);
  ctx.realtime.emitToUsers(
    members.map((m) => m.userId),
    { type: 'message:new', payload: { message } },
  );
  return { message, created: true };
}

export async function markConversationRead(
  ctx: AppContext,
  currentUserId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  await assertMembership(ctx, conversationId, currentUserId);

  const message = await ctx.store.findMessageById(messageId);
  if (!message || message.conversationId !== conversationId) {
    throw ApiError.notFound('Message not found.');
  }

  const readAt = new Date();
  await ctx.store.setLastRead(conversationId, currentUserId, readAt);

  const members = await ctx.store.listMembers(conversationId);
  ctx.realtime.emitToUsers(
    members.map((m) => m.userId),
    {
      type: 'read',
      payload: { conversationId, userId: currentUserId, messageId, readAt: readAt.toISOString() },
    },
  );
}
