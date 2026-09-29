/**
 * Storage interface.
 *
 * Services depend on this, never on Prisma directly. Two implementations exist:
 *  - PrismaStore  — PostgreSQL, used at runtime (src/data/prisma-store.ts)
 *  - MemoryStore  — in-process, used by the test suite and offline demo runs
 *
 * Keeping the surface small and explicit is what lets the whole HTTP + WebSocket flow
 * be exercised in tests without a database.
 */

import type {
  ConversationMemberRecord,
  ConversationRecord,
  MessageRecord,
  PasswordResetRecord,
  SessionRecord,
  UserRecord,
} from './records.js';

export interface CreateUserInput {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
}

export interface CreateSessionInput {
  userId: string;
  refreshHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  clientId: string;
  body: string;
}

export interface ListMessagesInput {
  conversationId: string;
  /** Exclusive upper bound: return messages strictly older than this. */
  before?: { createdAt: Date; id: string };
  limit: number;
}

export interface DataStore {
  /* Users */
  createUser(input: CreateUserInput): Promise<UserRecord>;
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findUserByIdentifier(identifier: string): Promise<UserRecord | null>;
  searchUsers(input: { query: string; excludeUserId: string; limit: number }): Promise<UserRecord[]>;
  updateUser(id: string, patch: { displayName?: string; avatarUrl?: string | null }): Promise<UserRecord>;
  updateUserPresence(id: string, status: 'online' | 'offline', lastSeenAt: Date | null): Promise<UserRecord | null>;
  updateUserPassword(id: string, passwordHash: string): Promise<void>;

  /* Sessions (refresh tokens) */
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  findSessionByRefreshHash(hash: string): Promise<SessionRecord | null>;
  revokeSession(id: string): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;

  /* Conversations */
  findDirectConversation(userAId: string, userBId: string): Promise<ConversationRecord | null>;
  createDirectConversation(userAId: string, userBId: string): Promise<ConversationRecord>;
  listConversationsForUser(userId: string): Promise<ConversationRecord[]>;
  findConversationById(id: string): Promise<ConversationRecord | null>;
  listMembers(conversationId: string): Promise<ConversationMemberRecord[]>;
  findMember(conversationId: string, userId: string): Promise<ConversationMemberRecord | null>;
  setLastRead(conversationId: string, userId: string, at: Date): Promise<void>;
  touchConversation(id: string, at: Date): Promise<void>;

  /* Messages */
  findMessageByClientId(conversationId: string, senderId: string, clientId: string): Promise<MessageRecord | null>;
  createMessage(input: CreateMessageInput): Promise<MessageRecord>;
  findMessageById(id: string): Promise<MessageRecord | null>;
  /** Newest-first, at most `limit` rows. The service reverses for the response. */
  listMessages(input: ListMessagesInput): Promise<MessageRecord[]>;
  getLastMessage(conversationId: string): Promise<MessageRecord | null>;
  countUnread(conversationId: string, userId: string, lastReadAt: Date | null): Promise<number>;

  /* Password reset */
  createPasswordReset(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<PasswordResetRecord>;
  findPasswordReset(tokenHash: string): Promise<PasswordResetRecord | null>;
  markPasswordResetUsed(id: string): Promise<void>;
}
