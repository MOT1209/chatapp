/**
 * Conversation and message routes (docs/api-contract.md §3.3–§3.4). All protected.
 */

import { Router } from 'express';
import type { AppContext } from '../context.js';
import { asyncHandler } from '../lib/errors.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { createRateLimit } from '../middleware/rate-limit.js';
import {
  createConversationSchema,
  listMessagesQuerySchema,
  markReadSchema,
  parse,
  sendMessageSchema,
} from '../validation/schemas.js';
import * as conversations from '../services/conversation.service.js';
import * as messages from '../services/message.service.js';

export function createConversationsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  const sendLimit = createRateLimit({ windowMs: 10 * 1000, max: 40, prefix: 'send' });

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const list = await conversations.listConversations(ctx, currentUserId(req));
      res.status(200).json({ conversations: list });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { participantId } = parse(createConversationSchema, req.body);
      const conversation = await conversations.createDirectConversation(ctx, currentUserId(req), participantId);
      res.status(200).json(conversation);
    }),
  );

  router.get(
    '/:id/messages',
    asyncHandler(async (req, res) => {
      const { cursor, limit } = parse(listMessagesQuerySchema, req.query);
      const page = await conversations.getMessages(ctx, currentUserId(req), req.params.id as string, { cursor, limit });
      res.status(200).json(page);
    }),
  );

  router.post(
    '/:id/messages',
    sendLimit,
    asyncHandler(async (req, res) => {
      const input = parse(sendMessageSchema, req.body);
      const result = await messages.sendMessage(ctx, currentUserId(req), req.params.id as string, input);
      // 201 for a fresh insert, 200 when an idempotent retry returned the stored message.
      res.status(result.created ? 201 : 200).json(result.message);
    }),
  );

  router.post(
    '/:id/read',
    asyncHandler(async (req, res) => {
      const { messageId } = parse(markReadSchema, req.body);
      await messages.markConversationRead(ctx, currentUserId(req), req.params.id as string, messageId);
      res.status(204).end();
    }),
  );

  return router;
}
