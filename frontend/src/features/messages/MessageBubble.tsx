import { memo } from "react";

import { Avatar } from "@/components/Avatar";
import { MessageStatus } from "./MessageStatus";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { CachedMessage } from "./useSendMessage";

type MessageBubbleProps = {
  message: CachedMessage;
  isMine: boolean;
  /** True for the last message in a run from the same sender. Controls the avatar. */
  isLastInGroup: boolean;
  onRetry: () => void;
};

/**
 * One message.
 *
 * Wrapped in `memo` because a typing indicator or an incoming message re-renders the
 * whole list otherwise, and a long thread makes that visible on a mid-range phone.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  isMine,
  isLastInGroup,
  onRetry,
}: MessageBubbleProps) {
  const delivery = message.delivery ?? message.status;
  const failed = delivery === "failed";

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isMine ? "justify-end" : "justify-start",
        // Tighter spacing inside a run from the same sender.
        isLastInGroup ? "mb-1" : "mb-0.5",
      )}
    >
      {!isMine ? (
        // The avatar occupies a fixed column on every row so bubbles stay aligned,
        // but is invisible except on the last of a group.
        <span className="w-8 shrink-0 self-end">
          {isLastInGroup ? (
            <Avatar
              name={message.sender.displayName}
              seed={message.sender.id}
              src={message.sender.avatarUrl}
              size="sm"
            />
          ) : null}
        </span>
      ) : null}

      <div className={cn("group flex max-w-[78%] flex-col sm:max-w-[70%]", isMine && "items-end")}>
        <div
          className={cn(
            "px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
            isMine
              ? "rounded-lg rounded-ee-sm bg-bubble-out text-bubble-out-fg"
              : "rounded-lg rounded-es-sm bg-bubble-in text-fg shadow-sm ring-1 ring-border",
            failed && "ring-1 ring-danger",
          )}
        >
          {message.body}
        </div>

        {isLastInGroup ? (
          <div className="mt-0.5 flex items-center gap-1.5 px-1 text-[10px] text-fg-subtle">
            <time dateTime={message.createdAt} title={new Date(message.createdAt).toISOString()}>
              {formatTime(message.createdAt)}
            </time>
            {isMine ? <MessageStatus delivery={delivery} onRetry={onRetry} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
