import { useQuery } from "@tanstack/react-query";

import { conversationsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { ConversationListResponse } from "@/lib/types";

/**
 * The conversation list.
 *
 * Re-fetched when the tab regains focus and every 30 seconds, so a conversation that
 * arrived while the socket was down still shows up. A failed background refetch keeps
 * the previous list on screen rather than blanking the sidebar.
 */
export function useConversations() {
  return useQuery<ConversationListResponse>({
    queryKey: queryKeys.conversations(),
    queryFn: ({ signal }) => conversationsApi.list(signal),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: 1,
  });
}
