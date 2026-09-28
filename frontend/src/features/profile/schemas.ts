/**
 * Profile form schema.
 *
 * Mirrors `PATCH /api/users/me` in docs/api-contract.md §3.2: every field optional on
 * the server, but the form requires a display name because an empty one is never
 * what the user meant.
 */

import { z } from "zod";

import { displayNameSchema } from "@/features/auth/schemas";

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
  /** An empty string means "clear the avatar", which the contract allows via `null`. */
  avatarUrl: z.union([z.url("أدخل رابطاً صحيحاً"), z.literal(""), z.null()]),
});

export type UpdateProfileValues = z.infer<typeof updateProfileSchema>;
