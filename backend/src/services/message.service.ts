import { prisma } from '../lib/prisma.js';
import { forbidden, notFound, validationError } from '../lib/errors.js';
import { serializeMessage, type MessageDTO } from '../lib/serializers.js';
import { assertMember, getOtherMemberIds } from './conversation.service.js';
import { wsHub } from '../realtime/ws-hub.js';

export async function sendMessage(
  userId: string,
  conversationId: string,
  clientId: string,
  body: string,
): Promise<{ message: MessageDTO; isNew: boolean }> {
  await assertMember(conversationId, userId);

  const existing = await prisma.message.findUnique({
    where: { senderId_clientId: { senderId: userId, clientId } },
    include: { sender: true },
  });
  if (existing) {
    // Retried send with the same clientId — return the original, not a duplicate.
    // Contract requires this even if the retry targets a different conversationId,
    // so a mismatch here means the client reused an id incorrectly.
    if (existing.conversationId !== conversationId) {
      throw validationError({ clientId: 'This clientId was already used in a different conversation.' });
    }
    return { message: serializeMessage(existing), isNew: false };
  }

  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: { conversationId, senderId: userId, clientId, body },
      include: { sender: true },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: message.createdAt },
    });
    return message;
  });

  const dto = serializeMessage(created);

  const recipientIds = await getOtherMemberIds(conversationId, userId);
  for (const recipientId of [...recipientIds, userId]) {
    wsHub.sendToUser(recipientId, { type: 'message:new', payload: { message: dto } });
  }

  return { message: dto, isNew: true };
}

export async function markRead(userId: string, conversationId: string, messageId: string): Promise<void> {
  await assertMember(conversationId, userId);

  const target = await prisma.message.findFirst({ where: { id: messageId, conversationId } });
  if (!target) {
    throw notFound('Message not found.');
  }

  const readAt = new Date();
  const result = await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      readAt: null,
      createdAt: { lte: target.createdAt },
    },
    data: { readAt },
  });

  if (result.count === 0) {
    // Idempotent per contract — calling it again with nothing new to mark is not an error.
    return;
  }

  const otherIds = await getOtherMemberIds(conversationId, userId);
  for (const otherId of [...otherIds, userId]) {
    wsHub.sendToUser(otherId, {
      type: 'read',
      payload: { conversationId, userId, messageId, readAt: readAt.toISOString() },
    });
  }
}

export async function deleteMessage(userId: string, conversationId: string, messageId: string): Promise<void> {
  await assertMember(conversationId, userId);

  const message = await prisma.message.findFirst({ where: { id: messageId, conversationId } });
  if (!message || message.deletedAt) {
    throw notFound('Message not found.');
  }
  if (message.senderId !== userId) {
    throw forbidden('You can only delete your own messages.');
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { body: '', deletedAt: new Date() },
    include: { sender: true },
  });

  const dto = serializeMessage(updated);
  const otherIds = await getOtherMemberIds(conversationId, userId);
  for (const otherId of [...otherIds, userId]) {
    wsHub.sendToUser(otherId, { type: 'message:updated', payload: { message: dto } });
  }
}
