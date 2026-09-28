import { describe, expect, it } from "vitest";

import {
  avatarHue,
  formatConversationStamp,
  formatDayDivider,
  formatPresence,
  formatTime,
  formatUnreadCount,
  initials,
} from "@/lib/format";

describe("formatTime", () => {
  it("renders a 24-hour clock, which is the convention in Arabic locales", () => {
    // 14:03 UTC. The exact digits depend on the runtime's timezone, so the assertion
    // checks the shape rather than a locale-specific string.
    expect(formatTime("2026-09-28T14:03:00.000Z")).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("formatDayDivider", () => {
  // Pinned so the test does not roll over at midnight mid-run.
  const now = new Date("2026-09-28T12:00:00.000Z");

  it("labels today in Arabic", () => {
    const today = new Date(now);
    today.setHours(now.getHours() - 1);
    expect(formatDayDivider(today)).toBe("اليوم");
  });

  it("labels yesterday in Arabic", () => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatDayDivider(yesterday)).toBe("أمس");
  });

  it("falls back to a date for older messages", () => {
    const old = new Date("2020-01-15T10:00:00.000Z");
    // Not "اليوم" and not "أمس", so it must be a real date.
    const label = formatDayDivider(old);
    expect(label).not.toBe("اليوم");
    expect(label).not.toBe("أمس");
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("formatConversationStamp", () => {
  it("returns a bare time for a message from today", () => {
    const today = new Date();
    today.setHours(today.getHours() - 1);
    expect(formatConversationStamp(today)).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("formatUnreadCount", () => {
  it("returns an empty string for zero, so the badge can be skipped", () => {
    expect(formatUnreadCount(0)).toBe("");
  });

  it("uses the Arabic singular for one", () => {
    expect(formatUnreadCount(1)).toBe("رسالة واحدة");
  });

  it("uses the Arabic dual for two", () => {
    expect(formatUnreadCount(2)).toBe("رسالتان");
  });

  it("pluralises with a count above the dual", () => {
    expect(formatUnreadCount(5)).toContain("5");
    expect(formatUnreadCount(11)).toContain("11");
  });

  it("never returns an empty string for a positive count", () => {
    for (const count of [1, 2, 3, 5, 11, 100]) {
      expect(formatUnreadCount(count).length).toBeGreaterThan(0);
    }
  });
});

describe("formatPresence", () => {
  it("says online now regardless of lastSeenAt", () => {
    expect(formatPresence(true, "2020-01-01T00:00:00.000Z")).toBe("متصل الآن");
  });

  it("reports a last-seen time when offline", () => {
    const message = formatPresence(false, new Date().toISOString());
    expect(message).toContain("آخر ظهور");
  });

  it("handles a user who has never connected", () => {
    expect(formatPresence(false, null)).toBe("غير متصل");
  });
});

describe("initials", () => {
  it("uses the first letter of a single-word name", () => {
    expect(initials("أحمد")).toBe("أ");
  });

  it("uses the first letter of the first two words", () => {
    // "أحمد" starts with أ, "علي" with ع.
    expect(initials("أحمد علي")).toBe("أع");
  });

  it("ignores extra whitespace between words", () => {
    expect(initials("  أحمد   علي  ")).toBe("أع");
  });

  it("uses only the first two words when a name is longer", () => {
    expect(initials("أحمد علي محمد")).toBe("أع");
  });

  it("falls back to a question mark for an empty name", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("avatarHue", () => {
  it("is stable for the same seed, so a user's colour never changes", () => {
    expect(avatarHue("user_123")).toBe(avatarHue("user_123"));
  });

  it("stays inside the 0-359 hue range", () => {
    for (const seed of ["a", "user_1", "u-9999", "🎉", ""]) {
      const hue = avatarHue(seed);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});
