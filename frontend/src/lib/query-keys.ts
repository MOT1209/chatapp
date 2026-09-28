/**
 * Query keys.
 *
 * Every key lives here so that an invalidation in one feature cannot accidentally
 * miss a cache entry built in another. The socket layer depends on this too: it
 * patches caches by key, and a typo would silently drop messages.
 */

export const queryKeys = {
  currentUser: ["auth", "me"] as const,

  userSearch: (query: string) => ["users", "search", query] as const,

  conversations: () => ["conversations", "list"] as const,

  /** Message history for one conversation, paginated by cursor. */
  messages: (conversationId: string) => ["conversations", conversationId, "messages"] as const,

  user: (id: string) => ["users", "id", id] as const,
} as const;
