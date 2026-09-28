import { cn } from "@/lib/cn";

/** Separator between days inside a thread. */
export function DateDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Three bouncing dots, shown while the other person is typing. */
export function TypingIndicator({ name }: { name?: string }) {
  return (
    <div
      className="flex items-end gap-2 px-1 py-1.5"
      // Announced politely so a screen reader says it without interrupting typing.
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="flex items-center gap-0.5 rounded-lg rounded-ee-sm bg-bubble-in px-3 py-2.5 shadow-sm ring-1 ring-border">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="typing-dot size-1.5 rounded-full bg-fg-subtle"
            // Staggered so the dots do not all move at once.
            style={{ animationDelay: `${index * 0.15}s` }}
          />
        ))}
      </span>
      {name ? <span className="sr-only">{name} يكتب الآن</span> : null}
    </div>
  );
}

/** Shown when a thread has no messages yet. */
export function FirstMessageHint({ name }: { name: string }) {
  const target = name.trim();
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-medium text-fg">ابدأ المحادثة</p>
      <p className="max-w-[16rem] text-xs leading-relaxed text-fg-muted">
        {target ? `هذه أول رسالة مع ${target}. اكتب شيئاً لتبدأ.` : "اكتب أول رسالة لتبدأ."}
      </p>
    </div>
  );
}

/** A short line under a date divider saying who is online. */
export function OnlineHint({ children }: { children: React.ReactNode }) {
  return <div className={cn("text-center text-[11px] text-fg-subtle")}>{children}</div>;
}
