/**
 * Date, number and text formatting.
 *
 * All output is Arabic and localised through `Intl`, so the app reads naturally
 * without hand-rolled concatenation. Everything here is pure, which makes it
 * directly unit-testable.
 */

import { isToday, isYesterday, isThisYear } from "date-fns";

const LOCALE = "ar";

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fullDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
});

const weekdayFormatter = new Intl.DateTimeFormat(LOCALE, { weekday: "long" });

const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

const pluralRules = new Intl.PluralRules(LOCALE);

type RelativeUnit = Intl.RelativeTimeFormatUnit;

const DIVISIONS: { amount: number; unit: RelativeUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** `14:03` — shown next to every message bubble. */
export function formatTime(value: string | Date): string {
  return timeFormatter.format(toDate(value));
}

/** `الاثنين 12 يناير، 14:03` — the full timestamp in a message tooltip. */
export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(toDate(value));
}

/** `الاثنين 12 يناير 2026` — used in the profile and on date dividers. */
export function formatFullDate(value: string | Date): string {
  return fullDateFormatter.format(toDate(value));
}

/** `اليوم` / `أمس` / `الاثنين` / `12 يناير` — the separator between days in a thread. */
export function formatDayDivider(value: string | Date): string {
  const date = toDate(value);
  if (isToday(date)) {
    return "اليوم";
  }
  if (isYesterday(date)) {
    return "أمس";
  }
  if (isThisYear(date)) {
    return weekdayFormatter.format(date);
  }
  return shortDateFormatter.format(date);
}

/** Compact stamp for the conversation list: time today, weekday this week, else a date. */
export function formatConversationStamp(value: string | Date): string {
  const date = toDate(value);
  if (isToday(date)) {
    return timeFormatter.format(date);
  }
  if (isYesterday(date)) {
    return "أمس";
  }
  const daysAgo = (Date.now() - date.getTime()) / 86_400_000;
  if (daysAgo < 7) {
    return weekdayFormatter.format(date);
  }
  return shortDateFormatter.format(date);
}

/** `قبل 5 دقائق` / `الآن` — used for "last seen" and for failed-message retry hints. */
export function formatRelativeTime(value: string | Date, now: Date = new Date()): string {
  let duration = (toDate(value).getTime() - now.getTime()) / 1000;
  // In the future (clock skew) read as "now" rather than "in -3 seconds".
  if (duration < 0) {
    duration = Math.abs(duration);
  }

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeFormatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return relativeFormatter.format(0, "second");
}

/** `متصل الآن` when online, otherwise `آخر ظهور قبل ساعتين`. */
export function formatPresence(
  isOnline: boolean,
  lastSeenAt: string | null,
): string {
  if (isOnline) {
    return "متصل الآن";
  }
  if (!lastSeenAt) {
    return "غير متصل";
  }
  return `آخر ظهور ${formatRelativeTime(lastSeenAt)}`;
}

/** Up to two letters for the avatar fallback, e.g. `أحمد` becomes `أا`. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    const first = words[0];
    return (first?.[0] ?? "?").toUpperCase();
  }
  const first = words[0]?.[0] ?? "";
  const second = words[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

/** `3 رسائل` / `رسالة واحدة` — Arabic has six plural forms, so this is not optional. */
export function formatUnreadCount(count: number): string {
  if (count <= 0) {
    return "";
  }
  const category = pluralRules.select(count);
  if (category === "one") {
    return "رسالة واحدة";
  }
  if (category === "two") {
    return "رسالتان";
  }
  if (count === 0) {
    return "لا رسائل";
  }
  if (category === "few") {
    return `${count} رسائل`;
  }
  return `${count} رسالة`;
}

/** A stable hue per user, so the avatar fallback colour is consistent everywhere. */
export function avatarHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}
