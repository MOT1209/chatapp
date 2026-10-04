import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, validationError } from '../lib/errors.js';
import { isUniqueConstraintError } from '../lib/prisma-errors.js';
import { serializeMessage, serializeUser, type ConversationDTO } from '../lib/serializers.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';

const conversationInclude = {
  members: { include: { user: true } },
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { sender: true },
  },
} satisfies Prisma.ConversationInclude;

type ConversationWithRelations = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

function toDTO(conversation: ConversationWithRelations, currentUserId: string, unreadCount: number): ConversationDTO {
  const otherMember = conversation.members.find((m) => m.userId !== currentUserId);
  if (!otherMember) {
    // Every direct conversation has exactly two members by construction.
    throw new Error(`Conversation ${conversation.id} has no other participant for user ${currentUserId}`);
  }
  const lastMessage = conversation.messages[0];
  return {
    id: conversation.id,
    type: 'direct',
    participant: serializeUser(otherMember.user),
    lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
    unreadCount,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

async function unreadCounts(conversationIds: string[], userId: string): Promise<Map<string, number>> {
  if (conversationIds.length === 0) {
    return new Map();
  }
  const grouped = await prisma.message.groupBy({
    by: ['conversationId'],
    where: {
      conversationId: { in: conversationIds },
      senderId: { not: userId },
      readAt: null,
      deletedAt: null,
    },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.conversationId, g._count._all]));
}

export type ConversationListOptions = {
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string | null;
  /** Page size; validated upstream (1–100). Default 50. */
  limit?: number;
};

export type ConversationListPage = {
  conversations: ConversationDTO[];
  nextCursor: string | null;
};

export const DEFAULT_CONVERSATION_LIMIT = 50;

/**
 * Cursor-paginated conversation list (repair brief §15). Ordered by
 * `updatedAt` desc with the id as tiebreaker; the response carries a
 * `nextCursor` when more pages exist. Existing clients that ignore
 * `cursor`/`nextCursor` keep working — they just see the first page.
 */
export async function listForUser(userId: string, options: ConversationListOptions = {}): Promise<ConversationListPage> {
  const limit = options.limit ?? DEFAULT_CONVERSATION_LIMIT;
  const decoded = options.cursor ? decodeCursor(options.cursor) : null;
  if (options.cursor && !decoded) {
    throw validationError({ cursor: 'Invalid cursor.' });
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      members: { some: { userId } },
      ...(decoded
        ? {
            // Strictly after the cursor row in the (updatedAt desc, id desc) order.
            OR: [
              { updatedAt: { lt: new Date(decoded.at) } },
              { updatedAt: new Date(decoded.at), id: { lt: decoded.id } },
            ],
          }
        : {}),
    },
    include: conversationInclude,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = conversations.length > limit;
  const page = hasMore ? conversations.slice(0, limit) : conversations;
  const counts = await unreadCounts(
    page.map((c) => c.id),
    userId,
  );
  const last = page[page.length - 1];

  return {
    conversations: page.map((c) => toDTO(c, userId, counts.get(c.id) ?? 0)),
    nextCursor: hasMore && last ? encodeCursor({ id: last.id, at: last.updatedAt.toISOString() }) : null,
  };
}

export async function createDirect(userId: string, participantId: string): Promise<ConversationDTO> {
  if (participantId === userId) {
    throw validationError({ participantId: 'You cannot start a conversation with yourself.' });
  }

  const participant = await prisma.user.findUnique({ where: { id: participantId } });
  if (!participant) {
    throw notFound('User not found.');
  }

  const directKey = [userId, participantId].sort().join(':');

  const existing = await prisma.conversation.findUnique({
    where: { directKey },
    include: conversationInclude,
  });
  if (existing) {
    const counts = await unreadCounts([existing.id], userId);
    return toDTO(existing, userId, counts.get(existing.id) ?? 0);
  }

  try {
    const created = await prisma.conversation.create({
      data: {
        type: 'direct',
        directKey,
        members: { create: [{ userId }, { userId: participantId }] },
      },
      include: conversationInclude,
    });
    return toDTO(created, userId, 0);
  } catch (err) {
    // Two concurrent "start chat" calls raced on directKey. The loser re-reads
    // instead of erroring, which is what makes POST /conversations idempotent.
    if (isUniqueConstraintError(err)) {
      const raceWinner = await prisma.conversation.findUnique({
        where: { directKey },
        include: conversationInclude,
      });
      if (raceWinner) {
        const counts = await unreadCounts([raceWinner.id], userId);
        return toDTO(raceWinner, userId, counts.get(raceWinner.id) ?? 0);
      }
    }
    throw err;
  }
}

async function requireMembership(conversationId: string, userId: string): Promise<void> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) {
    // A conversation that exists but the caller cannot see is reported as 404, not
    // 403 — its existence is not confirmed to a non-participant.
    throw notFound('Conversation not found.');
  }
}

export type MessagesPage = {
  messages: ReturnType<typeof serializeMessage>[];
  nextCursor: string | null;
};

export async function getMessages(
  userId: string,
  conversationId: string,
  cursor: string | null,
  limit: number,
): Promise<MessagesPage> {
  await requireMembership(conversationId, userId);

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (cursor && !decoded) {
    throw validationError({ cursor: 'Invalid cursor.' });
  }

  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      ...(decoded
        ? {
            // Strictly after the cursor row in the (createdAt desc, id desc) order.
            OR: [
              { createdAt: { lt: new Date(decoded.at) } },
              { createdAt: new Date(decoded.at), id: { lt: decoded.id } },
            ],
          }
        : {}),
    },
    include: { sender: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const oldest = page[page.length - 1];

  return {
    messages: page.reverse().map((m) => serializeMessage(m)),
    nextCursor: hasMore && oldest ? encodeCursor({ id: oldest.id, at: oldest.createdAt.toISOString() }) : null,
  };
}

/** Used by message.service to broadcast to the *other* participant(s). */
export async function getOtherMemberIds(conversationId: string, excludingUserId: string): Promise<string[]> {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: excludingUserId } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

export async function assertMember(conversationId: string, userId: string): Promise<void> {
  await requireMembership(conversationId, userId);
}
