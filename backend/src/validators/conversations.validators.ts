import { z } from 'zod';

export const createConversationSchema = z.object({
  participantId: z.string().trim().min(1, 'participantId is required.'),
});

export const messagesQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

// Conversation list pagination (docs/api-contract.md §3.3): additive query
// params; a client that sends neither gets the default page size and can
// ignore nextCursor exactly as before.
export const listConversationsQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const sendMessageSchema = z.object({
  clientId: z.string().trim().min(1, 'clientId is required.').max(200),
  body: z.string().trim().min(1, 'Message cannot be empty.').max(4000, 'Message is too long.'),
});

export const markReadSchema = z.object({
  messageId: z.string().trim().min(1, 'messageId is required.'),
});
