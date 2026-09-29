import { z } from 'zod';

// Runtime validation for docs/api-contract.md §4.3. Every frame arrives as
// untrusted JSON over the wire — the TypeScript ClientFrame type in
// ../types/realtime.ts describes the shape we want, but says nothing about
// what a hostile or buggy client can actually send. This is the boundary that
// makes the difference real: a JSON.parse result is `unknown`, not
// `ClientFrame`, until it passes this schema.

const authFrameSchema = z.object({
  type: z.literal('auth'),
  payload: z.object({ token: z.string().min(1) }),
});

const typingFrameSchema = z.object({
  type: z.literal('typing'),
  payload: z.object({
    conversationId: z.string().min(1),
    isTyping: z.boolean(),
  }),
});

const readFrameSchema = z.object({
  type: z.literal('read'),
  payload: z.object({
    conversationId: z.string().min(1),
    messageId: z.string().min(1),
  }),
});

const pingFrameSchema = z.object({
  type: z.literal('ping'),
  payload: z.object({}).strict(),
});

export const clientFrameSchema = z.discriminatedUnion('type', [
  authFrameSchema,
  typingFrameSchema,
  readFrameSchema,
  pingFrameSchema,
]);

export type ValidatedClientFrame = z.infer<typeof clientFrameSchema>;
