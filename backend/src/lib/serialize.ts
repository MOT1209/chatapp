/**
 * Record → contract DTO serialization.
 *
 * The frontend types in frontend/src/lib/types.ts are the mirror of these shapes.
 * Rules from docs/api-contract.md:
 *  - `isOnline` is derived from the stored presence status.
 *  - Timestamps are ISO 8601 UTC strings, or null.
 *  - Email is returned ONLY for the current user (auth, /users/me, PATCH /users/me).
 *    Every other user occurrence (participant, sender, search) omits it.
 *  - A message's `status` / `readAt` is derived from the recipient's `lastReadAt`.
 */

import type { MessageRecord, UserRecord } from '../data/records.js';

export interface PublicUserDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface SelfUserDto extends PublicUserDto {
  email: string;
}

export interface MessageDto {
  id: string;
  clientId: string;
  conversationId: string;
  sender: PublicUserDto;
  body: string;
  createdAt: string;
  status: 'sent' | 'read';
  readAt: string | null;
}

export interface ConversationDto {
  id: string;
  type: 'direct';
  participant: PublicUserDto;
  lastMessage: MessageDto | null;
  unreadCount: number;
  updatedAt: string;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function serializePublicUser(u: UserRecord): PublicUserDto {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    isOnline: u.status === 'online',
    lastSeenAt: iso(u.lastSeenAt),
    createdAt: u.createdAt.toISOString(),
  };
}

export function serializeSelfUser(u: UserRecord): SelfUserDto {
  return { ...serializePublicUser(u), email: u.email };
}

/**
 * Builds a message DTO. `recipientLastReadAt` is the *other* member's lastReadAt; a
 * message counts as read once the recipient has read up to or past its creation time.
 */
export function serializeMessage(
  message: MessageRecord,
  sender: UserRecord,
  recipientLastReadAt: Date | null,
): MessageDto {
  const isRead = recipientLastReadAt !== null && recipientLastReadAt.getTime() >= message.createdAt.getTime();
  return {
    id: message.id,
    clientId: message.clientId ?? message.id,
    conversationId: message.conversationId,
    sender: serializePublicUser(sender),
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    status: isRead ? 'read' : 'sent',
    readAt: isRead ? iso(recipientLastReadAt) : null,
  };
}
