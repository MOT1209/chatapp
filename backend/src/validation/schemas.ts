/**
 * Request validation schemas.
 *
 * One schema per request body / query, mirroring the rules in docs/api-contract.md §3.
 * `parse` turns a Zod failure into a VALIDATION_ERROR with a `fields` map, exactly the
 * shape the frontend renders next to each input.
 */

import { z, type ZodType } from 'zod';
import { ApiError } from '../lib/errors.js';

/** Runs a schema, throwing a contract VALIDATION_ERROR on failure. */
export function parse<S extends ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in fields)) {
      fields[key] = issue.message;
    }
  }
  throw ApiError.validation(fields);
}

const username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(30, 'Username must be at most 30 characters.')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Username may only contain letters, numbers, "_" and ".".')
  .transform((s) => s.toLowerCase());

const email = z
  .string()
  .trim()
  .email('Enter a valid email address.')
  .max(254, 'Email is too long.')
  .transform((s) => s.toLowerCase());

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be at most 72 characters.');

const displayName = z
  .string()
  .trim()
  .min(1, 'Display name is required.')
  .max(50, 'Display name must be at most 50 characters.');

const avatarUrl = z
  .string()
  .trim()
  .url('Enter a valid URL.')
  .max(2048, 'URL is too long.')
  .refine((v) => /^https?:\/\//i.test(v), 'Avatar URL must be an http(s) URL.')
  .nullable();

export const registerSchema = z.object({
  username,
  email,
  password,
  displayName,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username or email.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'A refresh token is required.'),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'The reset token is required.'),
  newPassword: password,
});

export const updateProfileSchema = z
  .object({
    displayName: displayName.optional(),
    avatarUrl: avatarUrl.optional(),
  })
  .refine((v) => v.displayName !== undefined || v.avatarUrl !== undefined, {
    message: 'Provide at least one field to update.',
    path: ['displayName'],
  });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search needs at least 2 characters.').max(100, 'Search query is too long.'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createConversationSchema = z.object({
  participantId: z.string().min(1, 'A participant id is required.'),
});

export const listMessagesQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const sendMessageSchema = z.object({
  clientId: z.string().trim().min(1, 'A clientId is required.').max(200, 'clientId is too long.'),
  body: z.string().trim().min(1, 'Message cannot be empty.').max(4000, 'Message is too long.'),
});

export const markReadSchema = z.object({
  messageId: z.string().min(1, 'A messageId is required.'),
});
