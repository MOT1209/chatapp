/**
 * Prisma / PostgreSQL DataStore.
 *
 * The runtime implementation. Unique-constraint violations from concurrent registers
 * or duplicate message sends are caught and mapped to the contract's error codes, so a
 * race produces the same result as the pre-check.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '../lib/errors.js';
import type {
  ConversationMemberRecord,
  ConversationRecord,
  MessageRecord,
  PasswordResetRecord,
  SessionRecord,
  UserRecord,
} from './records.js';
import type {
  CreateMessageInput,
  CreateSessionInput,
  CreateUserInput,
  DataStore,
  ListMessagesInput,
} from './store.js';

function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export class PrismaStore implements DataStore {
  constructor(private readonly prisma: PrismaClient) {}

  /* --------------------------------- Users -------------------------------- */

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    try {
      return await this.prisma.user.create({
        data: {
          email: input.email.toLowerCase(),
          username: input.username.toLowerCase(),
          displayName: input.displayName,
          passwordHash: input.passwordHash,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const target = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
        if (target.includes('email')) {
          throw ApiError.conflict('That email is already registered.', {
            email: 'That email is already registered.',
          });
        }
        throw ApiError.conflict('That username is already taken.', {
          username: 'That username is already taken.',
        });
      }
      throw err;
    }
  }

  findUserById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findUserByUsername(username: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  }

  findUserByIdentifier(identifier: string): Promise<UserRecord | null> {
    const value = identifier.toLowerCase();
    return this.prisma.user.findFirst({ where: { OR: [{ email: value }, { username: value }] } });
  }

  async searchUsers(input: { query: string; excludeUserId: string; limit: number }): Promise<UserRecord[]> {
    return this.prisma.user.findMany({
      where: {
        id: { not: input.excludeUserId },
        OR: [
          { username: { contains: input.query, mode: 'insensitive' } },
          { displayName: { contains: input.query, mode: 'insensitive' } },
        ],
      },
      orderBy: { username: 'asc' },
      take: input.limit,
    });
  }

  updateUser(id: string, patch: { displayName?: string; avatarUrl?: string | null }): Promise<UserRecord> {
    return this.prisma.user.update({ where: { id }, data: patch });
  }

  async updateUserPresence(
    id: string,
    status: 'online' | 'offline',
    lastSeenAt: Date | null,
  ): Promise<UserRecord | null> {
    try {
      return await this.prisma.user.update({ where: { id }, data: { status, lastSeenAt } });
    } catch {
      return null;
    }
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  /* -------------------------------- Sessions ------------------------------ */

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    return this.prisma.session.create({
      data: {
        userId: input.userId,
        refreshHash: input.refreshHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  findSessionByRefreshHash(hash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({ where: { refreshHash: hash } });
  }

  async revokeSession(id: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /* ----------------------------- Conversations ---------------------------- */

  findDirectConversation(userAId: string, userBId: string): Promise<ConversationRecord | null> {
    return this.prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [{ members: { some: { userId: userAId } } }, { members: { some: { userId: userBId } } }],
      },
    });
  }

  createDirectConversation(userAId: string, userBId: string): Promise<ConversationRecord> {
    return this.prisma.conversation.create({
      data: {
        type: 'direct',
        members: { create: [{ userId: userAId }, { userId: userBId }] },
      },
    });
  }

  listConversationsForUser(userId: string): Promise<ConversationRecord[]> {
    return this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findConversationById(id: string): Promise<ConversationRecord | null> {
    return this.prisma.conversation.findUnique({ where: { id } });
  }

  listMembers(conversationId: string): Promise<ConversationMemberRecord[]> {
    return this.prisma.conversationMember.findMany({ where: { conversationId } });
  }

  findMember(conversationId: string, userId: string): Promise<ConversationMemberRecord | null> {
    return this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
  }

  async setLastRead(conversationId: string, userId: string, at: Date): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return;
    if (!member.lastReadAt || member.lastReadAt.getTime() < at.getTime()) {
      await this.prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: at },
      });
    }
  }

  async touchConversation(id: string, at: Date): Promise<void> {
    await this.prisma.conversation.update({ where: { id }, data: { updatedAt: at } });
  }

  /* -------------------------------- Messages ------------------------------ */

  findMessageByClientId(
    conversationId: string,
    senderId: string,
    clientId: string,
  ): Promise<MessageRecord | null> {
    return this.prisma.message.findFirst({ where: { conversationId, senderId, clientId } });
  }

  async createMessage(input: CreateMessageInput): Promise<MessageRecord> {
    try {
      return await this.prisma.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          clientId: input.clientId,
          body: input.body,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.findMessageByClientId(
          input.conversationId,
          input.senderId,
          input.clientId,
        );
        if (existing) return existing;
      }
      throw err;
    }
  }

  findMessageById(id: string): Promise<MessageRecord | null> {
    return this.prisma.message.findUnique({ where: { id } });
  }

  listMessages(input: ListMessagesInput): Promise<MessageRecord[]> {
    const where: Prisma.MessageWhereInput = { conversationId: input.conversationId, deletedAt: null };
    if (input.before) {
      where.OR = [
        { createdAt: { lt: input.before.createdAt } },
        { createdAt: input.before.createdAt, id: { lt: input.before.id } },
      ];
    }
    return this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
    });
  }

  getLastMessage(conversationId: string): Promise<MessageRecord | null> {
    return this.prisma.message.findFirst({
      where: { conversationId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  countUnread(conversationId: string, userId: string, lastReadAt: Date | null): Promise<number> {
    return this.prisma.message.count({
      where: {
        conversationId,
        deletedAt: null,
        senderId: { not: userId },
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });
  }

  /* ----------------------------- Password reset --------------------------- */

  createPasswordReset(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<PasswordResetRecord> {
    return this.prisma.passwordResetToken.create({ data: input });
  }

  findPasswordReset(tokenHash: string): Promise<PasswordResetRecord | null> {
    return this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await this.prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
  }
}
