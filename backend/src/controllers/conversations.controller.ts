import type { Request, Response } from 'express';
import { validationError } from '../lib/errors.js';
import * as conversationService from '../services/conversation.service.js';
import * as messageService from '../services/message.service.js';
import { asyncHandler } from '../lib/async-handler.js';
import type { ListConversationsQuery, MessagesQuery } from '../validators/conversations.validators.js';
import { decodeCursor } from '../lib/cursor.js';

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = res.locals.query as ListConversationsQuery;
  const rawCursor = cursor;
  const messageCursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !messageCursor) {
    throw validationError({ cursor: 'Invalid cursor.' });
  }
  const page = await conversationService.listForUser(req.userId!, { cursor: rawCursor ?? null, limit });
  res.status(200).json(page);
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const { participantId } = req.body as { participantId: string };
  const conversation = await conversationService.createDirect(req.userId!, participantId);
  res.status(200).json(conversation);
});

export const messagesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = res.locals.query as MessagesQuery;
  const rawCursor = cursor;
  const messageCursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !messageCursor) {
    throw validationError({ cursor: 'Invalid cursor.' });
  }
  const page = await conversationService.getMessages(
    req.userId!,
    req.params.id as string,
    // The raw string: getMessages decodes it itself. Passing the decoded object (cast to string) made
    // every second page a 500.
    rawCursor ?? null,
    limit,
  );
  res.status(200).json(page);
});

export const sendMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clientId, body } = req.body as { clientId: string; body: string };
  const { message, isNew } = await messageService.sendMessage(
    req.userId!,
    req.params.id as string,
    clientId,
    body,
  );
  res.status(isNew ? 201 : 200).json(message);
});

export const markReadHandler = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.body as { messageId: string };
  await messageService.markRead(req.userId!, req.params.id as string, messageId);
  res.status(204).end();
});

export const deleteMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  await messageService.deleteMessage(req.userId!, req.params.id as string, req.params.messageId as string);
  res.status(204).end();
});
