/**
 * Typing indicators.
 *
 * Kept out of the query cache on purpose. Typing is a transient signal with no value
 * once it expires, so caching it would mean invalidating it constantly. Each entry
 * carries its own expiry and is dropped on read, so a user who stops typing stops
 * showing an indicator even if the final `isTyping: false` frame is lost.
 */

import { create } from "zustand";

/** The contract says an indicator should vanish within about 3s. */
const TYPING_TTL_MS = 3_000;

export const TYPING_THROTTLE_MS = 2_000;

type TypingEntry = {
  conversationId: string;
  expiresAt: number;
};

type TypingState = {
  /** Keyed by user id, so the same person cannot be counted twice. */
  byUser: Record<string, TypingEntry>;
  set: (userId: string, conversationId: string) => void;
  clear: (userId: string) => void;
  clearConversation: (conversationId: string) => void;
  clearAll: () => void;
};

/** Pending expiry timers, so the store can drop its own entries. */
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useTypingStore = create<TypingState>((set, get) => ({
  byUser: {},

  set: (userId, conversationId) => {
    // Restart this user's timer, so continuous typing keeps the indicator alive.
    const existing = expiryTimers.get(userId);
    if (existing) {
      clearTimeout(existing);
    }

    set((state) => ({
      byUser: {
        ...state.byUser,
        [userId]: { conversationId, expiresAt: Date.now() + TYPING_TTL_MS },
      },
    }));

    // Self-expiring. Without this the indicator would linger whenever the final
    // `isTyping: false` frame is lost, and nothing would re-render to hide it.
    expiryTimers.set(
      userId,
      setTimeout(() => {
        expiryTimers.delete(userId);
        get().clear(userId);
      }, TYPING_TTL_MS),
    );
  },

  clear: (userId) => {
    const timer = expiryTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      expiryTimers.delete(userId);
    }
    set((state) => {
      if (!(userId in state.byUser)) {
        return state;
      }
      const { [userId]: _removed, ...rest } = state.byUser;
      return { byUser: rest };
    });
  },

  clearConversation: (conversationId) =>
    set((state) => ({
      byUser: Object.fromEntries(
        Object.entries(state.byUser).filter(([, entry]) => entry.conversationId !== conversationId),
      ),
    })),

  clearAll: () => {
    for (const timer of expiryTimers.values()) {
      clearTimeout(timer);
    }
    expiryTimers.clear();
    set({ byUser: {} });
  },
}));

/**
 * Ids of the other people currently typing in a conversation.
 *
 * The caller maps ids to names, because the store deliberately holds no user data.
 * Read `byUser` through a hook and filter outside it, so the snapshot stays referentially
 * stable — a selector that built a new array each call would loop under useSyncExternalStore.
 */
export function typingUserIdsIn(
  byUser: Record<string, TypingEntry>,
  conversationId: string,
  currentUserId: string,
): string[] {
  const now = Date.now();
  return Object.entries(byUser)
    .filter(([, entry]) => entry.conversationId === conversationId && entry.expiresAt > now)
    .map(([userId]) => userId)
    .filter((userId) => userId !== currentUserId);
}
