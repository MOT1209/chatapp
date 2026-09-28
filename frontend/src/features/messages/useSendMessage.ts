import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { conversationsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { chatSocket } from "@/lib/socket";
import type { Message, MessageDelivery } from "@/lib/types";
import type { MessagesCache } from "@/features/realtime/RealtimeProvider";
import { useSession } from "@/features/auth/SessionProvider";

/** Prefix marking a message that exists only on this device. */
const LOCAL_PREFIX = "local:";

/**
 * A message plus its delivery state.
 *
 * `delivery` is absent on messages the backend sent, where the server's own
 * `status` is authoritative. It is present only for local-only entries.
 */
export type CachedMessage = Message & { delivery?: MessageDelivery };

/** One UUID per attempt. The backend de-duplicates on it, so retries are safe. */
function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers and non-secure contexts.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const { user } = useSession();

  /**
   * Writes a message into the messages cache.
   *
   * Only the newest page is touched: a message is always the latest thing in the
   * thread, and mutating older pages would corrupt the pagination boundaries.
   */
  const writeToCache = useCallback(
    (clientId: string, update: (message: CachedMessage) => CachedMessage) => {
      queryClient.setQueryData<MessagesCache>(queryKeys.messages(conversationId), (old) => {
        if (!old || old.pages.length === 0) {
          return old;
        }
        return {
          ...old,
          pages: old.pages.map((page, index) =>
            index === old.pages.length - 1
              ? {
                  ...page,
                  messages: page.messages.map((message) =>
                    message.clientId === clientId ? update(message) : message,
                  ),
                }
              : page,
          ),
        };
      });
    },
    [conversationId, queryClient],
  );

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !user) {
        return;
      }

      const clientId = newClientId();
      const now = new Date().toISOString();

      // 1. Show it immediately, marked as still in flight.
      queryClient.setQueryData<MessagesCache>(queryKeys.messages(conversationId), (old) => {
        const pages = old?.pages ?? [{ messages: [], nextCursor: null }];
        return {
          pages: pages.map((page, index) =>
            index === pages.length - 1
              ? {
                  ...page,
                  messages: [
                    ...page.messages,
                    {
                      id: `${LOCAL_PREFIX}${clientId}`,
                      clientId,
                      conversationId,
                      sender: user,
                      body: trimmed,
                      createdAt: now,
                      status: "sent",
                      readAt: null,
                      delivery: "pending",
                    },
                  ],
                }
              : page,
          ),
          pageParams: old?.pageParams ?? [null],
        };
      });

      try {
        // 2. Send. The server de-duplicates on clientId, so this is safe to repeat.
        const saved = await conversationsApi.send(conversationId, clientId, trimmed);

        // 3. Swap the optimistic entry for the server's version, matched by clientId.
        queryClient.setQueryData<MessagesCache>(queryKeys.messages(conversationId), (old) => {
          if (!old) {
            return old;
          }
          return {
            ...old,
            pages: old.pages.map((page, index) => {
              if (index !== old.pages.length - 1) {
                return page;
              }
              const withoutOptimistic = page.messages.filter(
                (message) => message.clientId !== clientId,
              );
              return {
                ...page,
                messages: [...withoutOptimistic, { ...saved, delivery: saved.status }],
              };
            }),
          };
        });
      } catch {
        // 4. Keep the bubble and mark it failed. Silently dropping a message the user
        //    can see is worse than showing them it did not go through.
        writeToCache(clientId, (message) => ({ ...message, delivery: "failed" }));
      }

      // The sidebar shows the last message and a timestamp, so it must follow.
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
    },
    [conversationId, queryClient, user, writeToCache],
  );

  /** Re-sends a message that previously failed, reusing the original clientId. */
  const retry = useCallback(
    async (failed: CachedMessage) => {
      if (failed.id.startsWith(LOCAL_PREFIX)) {
        await send(failed.body);
        return;
      }
      writeToCache(failed.clientId, (message) => ({ ...message, delivery: "pending" }));
      try {
        const saved = await conversationsApi.send(conversationId, failed.clientId, failed.body);
        writeToCache(failed.clientId, () => ({ ...saved, delivery: saved.status }));
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
      } catch {
        writeToCache(failed.clientId, (message) => ({ ...message, delivery: "failed" }));
      }
    },
    [conversationId, queryClient, send, writeToCache],
  );

  return { send, retry };
}

/* -------------------------------------------------------------------------- */
/*                            Sending typing frames                          */
/* -------------------------------------------------------------------------- */

/** How long the signal stays on after the last keystroke. Matches the contract's 2s. */
const TYPING_IDLE_MS = 2_000;

/**
 * Emits `typing` frames while the user types.
 *
 * At most one frame every 2s while typing continues, always followed by a final
 * `false`. That keeps traffic low and stops the indicator hanging if the socket drops
 * mid-keystroke.
 */
export function useTypingSignal(conversationId: string) {
  const lastSentAt = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);

  const stop = useCallback(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    if (isTyping.current) {
      isTyping.current = false;
      lastSentAt.current = 0;
      chatSocket.send({ type: "typing", payload: { conversationId, isTyping: false } });
    }
  }, [conversationId]);

  // Leaving the conversation, or unmounting, must not leave a stray indicator.
  useEffect(() => stop, [stop]);

  return useCallback(() => {
    const now = Date.now();
    if (!isTyping.current || now - lastSentAt.current >= TYPING_IDLE_MS) {
      isTyping.current = true;
      lastSentAt.current = now;
      chatSocket.send({ type: "typing", payload: { conversationId, isTyping: true } });
    }

    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
    }
    stopTimer.current = setTimeout(stop, TYPING_IDLE_MS);
  }, [conversationId, stop]);
}
