import { describe, expect, it } from "vitest";

import {
  flattenMessages,
  patchConversationsList,
  upsertMessage,
  type MessagesCache,
} from "./cache";
import type { Conversation, ConversationListResponse, Message, User } from "@/lib/types";

function makeUser(id: string): User {
  return {
    id,
    username: `user${id}`,
    email: `${id}@example.com`,
    displayName: `User ${id}`,
    avatarUrl: null,
    isOnline: false,
    lastSeenAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  const id = overrides.id ?? "m1";
  return {
    id,
    // Derived from the id so two messages never collide on clientId by accident,
    // which would make them look like the same message to `upsertMessage`.
    clientId: `client-${id}`,
    conversationId: "conv1",
    sender: makeUser("u1"),
    body: "hello",
    createdAt: "2026-09-28T14:00:00.000Z",
    status: "sent",
    readAt: null,
    ...overrides,
  };
}

describe("flattenMessages", () => {
  it("returns an empty array when there is no cache yet", () => {
    expect(flattenMessages(undefined)).toEqual([]);
  });

  it("joins pages in order, oldest first", () => {
    const cache: MessagesCache = {
      pages: [
        { messages: [makeMessage({ id: "m1" })], nextCursor: "cursor-2" },
        { messages: [makeMessage({ id: "m2" })], nextCursor: null },
      ],
      pageParams: [null, "cursor-2"],
    };
    expect(flattenMessages(cache).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("drops a duplicate id, so a re-sent frame cannot show twice", () => {
    const cache: MessagesCache = {
      pages: [
        { messages: [makeMessage({ id: "m1" })], nextCursor: "cursor-2" },
        { messages: [makeMessage({ id: "m1" }), makeMessage({ id: "m2" })], nextCursor: null },
      ],
      pageParams: [null, "cursor-2"],
    };
    expect(flattenMessages(cache).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("upsertMessage", () => {
  it("appends and sorts when the message is new", () => {
    const existing = [makeMessage({ id: "m1", createdAt: "2026-09-28T14:00:00.000Z" })];
    const incoming = makeMessage({ id: "m2", createdAt: "2026-09-28T13:00:00.000Z" });
    // An out-of-order arrival must still land in the right place.
    expect(upsertMessage(existing, incoming).map((m) => m.id)).toEqual(["m2", "m1"]);
  });

  it("replaces in place without reordering, so a status change does not jump", () => {
    const existing = [
      makeMessage({ id: "m1", createdAt: "2026-09-28T13:00:00.000Z" }),
      makeMessage({ id: "m2", createdAt: "2026-09-28T14:00:00.000Z" }),
    ];
    const updated = makeMessage({
      id: "m1",
      createdAt: "2026-09-28T13:00:00.000Z",
      status: "read",
    });
    const result = upsertMessage(existing, updated);
    expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(result[0]?.status).toBe("read");
  });

  it("matches on clientId when the id is still local, reconciling the optimistic message", () => {
    const existing = [makeMessage({ id: "local:abc", clientId: "abc" })];
    // The server's version has a real id but the same clientId.
    const confirmed = makeMessage({ id: "m99", clientId: "abc" });
    const result = upsertMessage(existing, confirmed);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("m99");
  });
  it("does not mutate the input array", () => {
    const existing = [makeMessage({ id: "m1" })];
    const snapshot = [...existing];
    upsertMessage(existing, makeMessage({ id: "m2" }));
    expect(existing).toEqual(snapshot);
  });
});

describe("patchConversationsList", () => {
  function makeList(): ConversationListResponse {
    const conversation: Conversation = {
      id: "conv1",
      type: "direct",
      participant: makeUser("u2"),
      lastMessage: null,
      unreadCount: 0,
      updatedAt: "2026-09-28T14:00:00.000Z",
    };
    return { conversations: [conversation] };
  }

  it("applies the update to the matching conversation", () => {
    const result = patchConversationsList(makeList(), "conv1", (c) => ({
      ...c,
      unreadCount: 5,
    }));
    expect(result.conversations[0]?.unreadCount).toBe(5);
  });

  it("returns the same object reference when nothing matched, so React can skip a render", () => {
    const list = makeList();
    expect(patchConversationsList(list, "missing", (c) => c)).toBe(list);
  });

  it("increments the unread count for an incoming message", () => {
    const start = patchConversationsList(makeList(), "conv1", (c) => ({ ...c, unreadCount: 2 }));
    const next = patchConversationsList(start, "conv1", (c) => ({
      ...c,
      unreadCount: c.unreadCount + 1,
    }));
    expect(next.conversations[0]?.unreadCount).toBe(3);
  });
});
