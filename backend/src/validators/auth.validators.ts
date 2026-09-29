import { z } from 'zod';

// bcrypt only uses the first 72 BYTES of the input and silently ignores the rest.
// String length counts characters, so a 40-letter Arabic password (80 bytes) would
// pass a `.max(72)` check while its last 4 letters were never part of the hash.
const MAX_PASSWORD_BYTES = 72;
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= MAX_PASSWORD_BYTES, {
    message: `Password must be at most ${MAX_PASSWORD_BYTES} bytes (fewer characters if it uses non-Latin letters).`,
  });

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(30, 'Username must be at most 30 characters.')
    .transform((v) => v.toLowerCase())
    .refine((v) => /^[a-z0-9_.]+$/.test(v), {
      message: 'Username may only contain lowercase letters, numbers, "_" and ".".',
    }),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.')
    .max(50, 'Display name must be at most 50 characters.'),
});
export type RegisterBody = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username or email.'),
  password: z.string().min(1, 'Password is required.'),
});
export type LoginBody = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'token is required.'),
  newPassword: passwordSchema,
});
