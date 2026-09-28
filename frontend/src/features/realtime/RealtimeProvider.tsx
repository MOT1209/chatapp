/**
 * Realtime bridge.
 *
 * The socket is an invalidation signal, not a source of truth. Every frame is folded
 * into the TanStack Query cache, so a reload rebuilding from REST produces exactly
 * the same state. That is what keeps a dropped frame from becoming a lost message.
 *
 * The pure cache helpers live in `./cache` so this file exports only a component.
 */

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { chatSocket } from "@/lib/socket";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/features/auth/SessionProvider";
import { useTypingStore } from "@/stores/useTypingStore";
import {
  patchConversationsList,
  upsertMessage,
  type MessagesCache,
} from "./cache";
import type { ConversationListResponse, Message } from "@/lib/types";

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, status } = useSession();
  const currentUserId = user?.id ?? null;

  useEffect(() => {
    if (status !== "authenticated" || !currentUserId) {
      return;
    }

    /* ---------------------------------------------------------------- */
    /*                        New incoming message                       */
    /* ---------------------------------------------------------------- */

    const unsubscribeNew = chatSocket.on("message:new", ({ message }) => {
      queryClient.setQueryData<MessagesCache>(queryKeys.messages(message.conversationId), (old) => {
        if (!old) {
          // History for this conversation has not been opened yet. Nothing to patch;
          // the list patch below is enough to make it appear.
          return old;
        }
        return {
          ...old,
          pages: old.pages.map((page, index) =>
            // Only the newest page is worth mutating; older pages are already read.
            index === old.pages.length - 1
              ? { ...page, messages: upsertMessage(page.messages, message) }
              : page,
          ),
        };
      });

      // The unread count is decided by whether the conversation is on screen right now.
      const isActive =
        document.visibilityState === "visible" && isConversationOpen(message.conversationId);

      queryClient.setQueryData<ConversationListResponse>(queryKeys.conversations(), (old) => {
        if (!old) {
          return old;
        }
        return patchConversationsList(old, message.conversationId, (conversation) => ({
          ...conversation,
          lastMessage: message,
          updatedAt: message.createdAt,
          unreadCount:
            message.sender.id === currentUserId
              ? conversation.unreadCount
              : isActive
                ? 0
                : conversation.unreadCount + 1,
        }));
      });

      if (isActive && message.sender.id !== currentUserId) {
        // The thread is open and visible, so it counts as read. The badge was already
        // zeroed above; the server only needs to be told.
        chatSocket.send({
          type: "read",
          payload: { conversationId: message.conversationId, messageId: message.id },
        });
      }
    });

    /* ---------------------------------------------------------------- */
    /*                       Status / receipt changes                    */
    /* ---------------------------------------------------------------- */

    const patchMessageEverywhere = (message: Message) => {
      queryClient.setQueryData<MessagesCache>(queryKeys.messages(message.conversationId), (old) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          pages: old.pages.map((page) => {
            const index = page.messages.findIndex(
              (candidate) =>
                candidate.id === message.id || candidate.clientId === message.clientId,
            );
            const existing = index === -1 ? undefined : page.messages[index];
            if (!existing) {
              return page;
            }
            const messages = [...page.messages];
            messages[index] = { ...existing, ...message };
            return { ...page, messages };
          }),
        };
      });
    };

    const unsubscribeUpdated = chatSocket.on("message:updated", ({ message }) => {
      patchMessageEverywhere(message);
    });

    const unsubscribeRead = chatSocket.on(
      "read",
      ({ conversationId, userId, messageId, readAt }) => {
        if (userId !== currentUserId) {
          // Somebody else read the thread. Their own read state is not shown to us, but
          // the sender's messages becoming read is, so the ticks can turn blue.
          queryClient.setQueryData<MessagesCache>(queryKeys.messages(conversationId), (old) => {
            if (!old) {
              return old;
            }
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.map((message) =>
                  message.sender.id === userId && message.id === messageId
                    ? { ...message, status: "read" as const, readAt }
                    : message,
                ),
              })),
            };
          });
          return;
        }

        // We are the ones who read it. Update the local messages and clear the badge.
        queryClient.setQueryData<MessagesCache>(queryKeys.messages(conversationId), (old) => {
          if (!old) {
            return old;
          }
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

        queryClient.setQueryData<ConversationListResponse>(queryKeys.conversations(), (old) =>
          old
            ? patchConversationsList(old, conversationId, (c) => ({ ...c, unreadCount: 0 }))
            : old,
        );
      },
    );

    /* ---------------------------------------------------------------- */
    /*                             Presence                             */
    /* ---------------------------------------------------------------- */

    const unsubscribePresence = chatSocket.on(
      "presence",
      ({ userId, isOnline, lastSeenAt }) => {
        queryClient.setQueryData<ConversationListResponse>(queryKeys.conversations(), (old) => {
          if (!old) {
            return old;
          }
          return {
            conversations: old.conversations.map((conversation) =>
              conversation.participant.id === userId
                ? {
                    ...conversation,
                    participant: { ...conversation.participant, isOnline, lastSeenAt },
                  }
                : conversation,
            ),
          };
        });

        queryClient.setQueryData(queryKeys.user(userId), (old) =>
          old && typeof old === "object" && "isOnline" in old
            ? { ...old, isOnline, lastSeenAt }
            : old,
        );
      },
    );

    /* ---------------------------------------------------------------- */
    /*                              Typing                              */
    /* ---------------------------------------------------------------- */

    const unsubscribeTyping = chatSocket.on(
      "typing",
      ({ conversationId, userId, isTyping }) => {
        const typing = useTypingStore.getState();
        if (isTyping) {
          typing.set(userId, conversationId);
        } else {
          typing.clear(userId);
        }
      },
    );

    return () => {
      unsubscribeNew();
      unsubscribeUpdated();
      unsubscribeRead();
      unsubscribePresence();
      unsubscribeTyping();
    };
  }, [queryClient, status, currentUserId]);

  /* Clear stale typing state whenever the session ends. */
  useEffect(() => {
    if (status !== "authenticated") {
      useTypingStore.getState().clearAll();
    }
  }, [status]);

  return <>{children}</>;
}

/**
 * Whether a conversation is the one currently on screen.
 *
 * The URL is the single source of truth for which conversation is open, so reading it
 * directly avoids duplicating that state in a store.
 */
function isConversationOpen(conversationId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.pathname.endsWith(`/c/${conversationId}`) ||
    window.location.pathname.endsWith(`/chats/${conversationId}`);
}
