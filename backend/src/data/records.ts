/**
 * Internal persistence records.
 *
 * These mirror the Prisma models but are declared independently so the service layer
 * does not import Prisma types directly. Both the Prisma store and the in-memory store
 * produce these shapes, which keeps the services storage-agnostic and unit-testable.
 */

export interface UserRecord {
  id: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  avatarUrl: string | null;
  status: string; // "online" | "offline"
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface ConversationRecord {
  id: string;
  type: string; // "direct"
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMemberRecord {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  lastReadAt: Date | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  clientId: string | null;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}
