/**
 * Realtime cache helpers.
 *
 * Split out of `RealtimeProvider.tsx` so that file exports only the component, which
 * keeps Fast Refresh working, and so the pure functions can be unit tested without
 * rendering anything.
 *
 * Cache shapes touched here:
 *  - `queryKeys.conversations()` → `ConversationListResponse`
 *  - `queryKeys.messages(id)`    → infinite `MessagesPage`
 */

import { useCallback } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";

import { chatSocket } from "@/lib/socket";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/features/auth/SessionProvider";
import type { Conversation, ConversationListResponse, Message, MessagesPage } from "@/lib/types";

export type MessagesCache = InfiniteData<MessagesPage, string | null>;

/**
 * Flattens every page into one list, keeping only the first copy of each id and
 * ordering the result oldest → newest.
 *
 * The pages arrive newest-page-first (the first fetch is the latest history, and the
 * "load older" button appends older pages after it), so a plain concatenation would put
 * older messages below newer ones. Sorting by creation time — a stable sort, so equal
 * timestamps keep their insertion order — yields the correct chronological thread.
 */
export function flattenMessages(data: MessagesCache | undefined): Message[] {
  if (!data) {
    return [];
  }
  const seen = new Set<string>();
  const all: Message[] = [];
  for (const page of data.pages) {
    for (const message of page.messages) {
      if (!seen.has(message.id)) {
        seen.add(message.id);
        all.push(message);
      }
    }
  }
  return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Inserts or replaces a message, keeping the list ordered by creation time. */
export function upsertMessage(messages: Message[], incoming: Message): Message[] {
  const index = messages.findIndex(
    (message) => message.id === incoming.id || message.clientId === incoming.clientId,
  );

  if (index === -1) {
    return [...messages, incoming].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  const next = [...messages];
  // Preserve the list position: an update must never reorder the thread.
  next[index] = incoming;
  return next;
}

/** Applies `update` to one conversation, returning the same object when nothing matched. */
export function patchConversationsList(
  data: ConversationListResponse,
  conversationId: string,
  update: (conversation: Conversation) => Conversation,
): ConversationListResponse {
  let changed = false;
  const conversations = data.conversations.map((conversation) => {
    if (conversation.id !== conversationId) {
      return conversation;
    }
    changed = true;
    return update(conversation);
  });
  return changed ? { ...data, conversations } : data;
}

/**
 * Tells the server a conversation has been read, and clears the local badge.
 *
 * Sent over the socket rather than REST because it fires on every visibility change
 * and on each message that arrives while the tab is visible, where a new HTTP request
 * per message would be wasteful. The cache is updated optimistically so the badge never
 * lags behind the UI, and the server's `read` frame confirms afterwards.
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const currentUserId = user?.id ?? null;

  return useCallback(
    (conversationId: string, messageId: string) => {
      if (!currentUserId) {
        return;
      }

      if (messageId) {
        chatSocket.send({ type: "read", payload: { conversationId, messageId } });
      }

      queryClient.setQueryData<ConversationListResponse>(queryKeys.conversations(), (old) =>
        old ? patchConversationsList(old, conversationId, (c) => ({ ...c, unreadCount: 0 })) : old,
      );

      queryClient.setQueryData<MessagesCache>(queryKeys.messages(conversationId), (old) => {
        if (!old) {
          return old;
        }
        const readAt = new Date().toISOString();
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((message) =>
              message.sender.id === currentUserId && message.status !== "read"
                ? { ...message, status: "read" as const, readAt }
                : message,
            ),
          })),
        };
      });
    },
    [queryClient, currentUserId],
  );
}
