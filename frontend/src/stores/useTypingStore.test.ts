import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { typingUserIdsIn, useTypingStore } from "./useTypingStore";

const TTL_MS = 3_000;

beforeEach(() => {
  useTypingStore.getState().clearAll();
  vi.useFakeTimers();
});

afterEach(() => {
  useTypingStore.getState().clearAll();
  vi.useRealTimers();
});

describe("useTypingStore", () => {
  it("starts empty", () => {
    expect(useTypingStore.getState().byUser).toEqual({});
  });

  it("records a user who is typing", () => {
    useTypingStore.getState().set("u2", "conv1");
    expect(useTypingStore.getState().byUser.u2?.conversationId).toBe("conv1");
  });

  it("drops the entry when the user stops typing", () => {
    useTypingStore.getState().set("u2", "conv1");
    useTypingStore.getState().clear("u2");
    expect(useTypingStore.getState().byUser.u2).toBeUndefined();
  });

  it("self-expires after the TTL, so a lost stop frame cannot leave a stuck indicator", () => {
    useTypingStore.getState().set("u2", "conv1");
    expect(useTypingStore.getState().byUser.u2).toBeDefined();

    vi.advanceTimersByTime(TTL_MS + 10);
    expect(useTypingStore.getState().byUser.u2).toBeUndefined();
  });

  it("keeps the indicator alive while typing continues", () => {
    useTypingStore.getState().set("u2", "conv1");

    // Re-assert every second, so the timer is restarted each time.
    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(1_000);
      useTypingStore.getState().set("u2", "conv1");
    }

    expect(useTypingStore.getState().byUser.u2).toBeDefined();
  });

  it("keeps one entry per user, so a duplicate frame cannot double-count", () => {
    useTypingStore.getState().set("u2", "conv1");
    useTypingStore.getState().set("u2", "conv1");
    expect(Object.keys(useTypingStore.getState().byUser)).toHaveLength(1);
  });

  it("clears every conversation at once on sign-out", () => {
    useTypingStore.getState().set("u2", "conv1");
    useTypingStore.getState().set("u3", "conv2");
    useTypingStore.getState().clearAll();
    expect(useTypingStore.getState().byUser).toEqual({});
  });
});

describe("typingUserIdsIn", () => {
  it("returns other users typing in the requested conversation", () => {
    useTypingStore.getState().set("u2", "conv1");
    useTypingStore.getState().set("u3", "conv2");

    expect(typingUserIdsIn(useTypingStore.getState().byUser, "conv1", "u1")).toEqual(["u2"]);
  });

  it("excludes the current user, so you never see your own indicator", () => {
    useTypingStore.getState().set("u1", "conv1");
    expect(typingUserIdsIn(useTypingStore.getState().byUser, "conv1", "u1")).toEqual([]);
  });

  it("ignores expired entries", () => {
    useTypingStore.getState().set("u2", "conv1");
    vi.advanceTimersByTime(TTL_MS + 10);
    expect(typingUserIdsIn(useTypingStore.getState().byUser, "conv1", "u1")).toEqual([]);
  });

  it("returns an empty array for a conversation nobody is typing in", () => {
    expect(typingUserIdsIn({}, "conv1", "u1")).toEqual([]);
  });
});
