import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { usersApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { UserSearchResponse } from "@/lib/types";

/** Below this length the backend rejects the query, so do not ask. */
const MIN_QUERY_LENGTH = 2;

/** Matches the contract: the backend must not be spammed on every keystroke. */
const DEBOUNCE_MS = 300;

export function useUserSearch(query: string) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const enabled = debounced.length >= MIN_QUERY_LENGTH;

  return useQuery<UserSearchResponse>({
    queryKey: queryKeys.userSearch(debounced),
    queryFn: ({ signal }) => usersApi.search(debounced, signal),
    enabled,
    // Each keystroke renders a fresh key, so results are never shown for a stale query.
    staleTime: 30_000,
    retry: 1,
  });
}
