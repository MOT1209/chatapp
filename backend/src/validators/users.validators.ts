import { z } from 'zod';

/** Zod runs refinements even after `.url()` failed, so this must not throw on garbage. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

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
    .union([
      z
        .string()
        .trim()
        .max(2048)
        .url('Enter a valid URL.')
        // `.url()` accepts any scheme, including javascript: and data:. Contract §3.2: http(s) only.
        .refine((v) => isHttpUrl(v), { message: 'Enter an http(s) URL.' }),
      z.null(),
    ])
    .optional(),
});
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
