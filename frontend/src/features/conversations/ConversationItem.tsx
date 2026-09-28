import { Link } from "react-router";
import { MessageSquare } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { formatConversationStamp, formatUnreadCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Conversation } from "@/lib/types";

type ConversationItemProps = {
  conversation: Conversation;
  isActive: boolean;
};

/** One row in the sidebar. A link, so it is keyboard- and middle-click friendly. */
export function ConversationItem({ conversation, isActive }: ConversationItemProps) {
  const { participant, lastMessage, unreadCount, updatedAt } = conversation;

  return (
    <Link
      to={`/chats/${conversation.id}`}
      // `current` tells assistive tech this row is the one in view.
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg p-2.5 transition-colors duration-150",
        isActive ? "bg-accent-soft" : "hover:bg-surface-2",
      )}
    >
      <Avatar
        name={participant.displayName}
        seed={participant.id}
        src={participant.avatarUrl}
        size="md"
        isOnline={participant.isOnline}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unreadCount > 0 ? "font-bold text-fg" : "font-medium text-fg",
            )}
          >
            {participant.displayName}
          </span>
          <span className="shrink-0 text-[11px] text-fg-subtle">
            {formatConversationStamp(updatedAt)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-xs",
              unreadCount > 0 ? "font-medium text-fg" : "text-fg-muted",
            )}
          >
            {lastMessage ? (
              lastMessage.body
            ) : (
              <span className="italic">لا رسائل بعد</span>
            )}
          </span>

          {unreadCount > 0 ? (
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg"
              aria-label={formatUnreadCount(unreadCount)}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/** Placeholder row for conversations that have not loaded yet. */
export function ConversationItemSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2.5" aria-hidden>
      <div className="size-10 shrink-0 animate-pulse rounded-full bg-surface-3" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-3" />
        <div className="h-2.5 w-2/3 animate-pulse rounded bg-surface-3" />
      </div>
    </div>
  );
}

/** Shown when the search finds nothing. */
export function NoSearchResults() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <MessageSquare className="size-5 text-fg-subtle" />
      <p className="text-xs text-fg-muted">لا توجد نتائج مطابقة</p>
    </div>
  );
}
