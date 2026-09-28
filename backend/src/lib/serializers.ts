import type { User as PrismaUser, Message as PrismaMessage } from '@prisma/client';

// Wire shapes from docs/api-contract.md §2. Keep these in lockstep with
// app/lib/models/ — a field renamed here without an update there breaks
// the client silently, since neither side validates the other's shape at runtime.

export type UserDTO = {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

/**
 * Only the "me" endpoints and the register/login response pass `includeEmail: true`.
 * Every other place a user appears (search results, a conversation participant, a
 * message sender) omits it — the frontend only ever renders `user.email` when
 * `isOwnProfile` is true, so no caller needs another user's address, and the API
 * must not hand it out.
 */
export function serializeUser(user: PrismaUser, options: { includeEmail?: boolean } = {}): UserDTO {
  return {
    id: user.id,
    username: user.username,
    ...(options.includeEmail ? { email: user.email } : {}),
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

export type MessageDTO = {
  id: string;
  clientId: string;
  conversationId: string;
  sender: UserDTO;
  body: string;
  createdAt: string;
  status: 'sent' | 'read';
  readAt: string | null;
  deletedAt: string | null;
};

export function serializeMessage(message: PrismaMessage & { sender: PrismaUser }): MessageDTO {
  const deleted = message.deletedAt !== null;
  return {
    id: message.id,
    clientId: message.clientId,
    conversationId: message.conversationId,
    sender: serializeUser(message.sender),
    body: deleted ? '' : message.body,
    createdAt: message.createdAt.toISOString(),
    status: message.readAt ? 'read' : 'sent',
    readAt: message.readAt ? message.readAt.toISOString() : null,
    // Additive field beyond the original contract — see docs/api-contract.md §3.4.1.
    // Optional so a frontend built before this addition ignores it safely.
    deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
  };
}

export type ConversationDTO = {
  id: string;
  type: 'direct';
  participant: UserDTO;
  lastMessage: MessageDTO | null;
  unreadCount: number;
  updatedAt: string;
};
