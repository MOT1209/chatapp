import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { conversationsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { MessagesPage } from "@/lib/types";
import type { MessagesCache } from "@/features/realtime/cache";

/**
 * Message history for one conversation, oldest first.
 *
 * Cursor-paginated rather than offset-paginated, because new messages arriving at the
 * bottom would shift every offset and make the list skip or repeat rows.
 *
 * Older pages are kept in the cache so scrolling back does not refetch.
 */
export function useMessages(conversationId: string | undefined) {
  return useInfiniteQuery<MessagesPage, Error, MessagesCache, ReturnType<typeof queryKeys.messages>, string | null>({
    queryKey: queryKeys.messages(conversationId ?? ""),
    queryFn: ({ pageParam, signal }) => conversationsApi.messages(conversationId!, pageParam, 30, signal),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(conversationId),
    staleTime: 10_000,
    // An extra refetch window is not worth it: the socket delivers new messages.
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

/** Refetches history, used by the retry button after a failed load. */
export function useRefetchMessages(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    if (conversationId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
    }
  };
}
