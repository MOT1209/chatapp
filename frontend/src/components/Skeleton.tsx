import { cn } from "@/lib/cn";

/**
 * Loading placeholder.
 *
 * A skeleton is used rather than a spinner because it shows the shape of what is
 * arriving, which makes the wait feel shorter. `animate-pulse` is disabled globally
 * under prefers-reduced-motion.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

/** Placeholder rows for the conversation list. */
export function ConversationSkeleton() {
  return (
    <div className="space-y-1 p-2" aria-busy="true" aria-label="جارٍ تحميل المحادثات">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg p-2.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder bubbles for the message thread. */
export function MessageSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="جارٍ تحميل الرسائل">
      {[false, true, false, true, true].map((isMine, index) => (
        <div key={index} className={cn("flex gap-2.5", isMine ? "justify-end" : "justify-start")}>
          {!isMine ? <Skeleton className="size-8 shrink-0 rounded-full" /> : null}
          <Skeleton
            className={cn("h-10 max-w-[70%] rounded-lg", isMine ? "w-52" : "w-64")}
          />
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows for user search results. */
export function UserSkeleton() {
  return (
    <div className="space-y-1" aria-busy="true" aria-label="جارٍ البحث">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg p-2.5">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
