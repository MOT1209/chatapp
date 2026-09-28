import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search query must be at least 2 characters.'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.')
    .max(50, 'Display name must be at most 50 characters.')
    .optional(),
  avatarUrl: z
    .union([z.string().trim().url('Enter a valid URL.').max(2048), z.null()])
    .optional(),
});
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
