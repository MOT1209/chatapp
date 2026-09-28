import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { differenceInMinutes, isSameDay } from "date-fns";

import { MessageBubble } from "./MessageBubble";
import { DateDivider, FirstMessageHint, TypingIndicator } from "./ChatBits";
import { useMessages } from "./useMessages";
import { useSendMessage, type CachedMessage } from "./useSendMessage";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { MessageSkeleton } from "@/components/Skeleton";
import { flattenMessages } from "@/features/realtime/cache";
import { useSession } from "@/features/auth/SessionProvider";
import { typingUserIdsIn, useTypingStore } from "@/stores/useTypingStore";
import { formatDayDivider } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Messages closer together than this from one sender are drawn as a single group. */
const GROUP_WINDOW_MINUTES = 5;

/** How close to the bottom still counts as "at the bottom", in pixels. */
const STICKY_THRESHOLD_PX = 120;

type MessageListProps = {
  conversationId: string;
  /** The other person's display name, used by the empty and typing states. */
  peerName: string;
};

export function MessageList({ conversationId, peerName }: MessageListProps) {
  const { user } = useSession();
  const currentUserId = user?.id ?? "";

  const messagesQuery = useMessages(conversationId);
  const { retry } = useSendMessage(conversationId);

  const messages = useMemo(
    () => flattenMessages(messagesQuery.data),
    [messagesQuery.data],
  );

  // Select the map, then filter outside the selector. A selector returning a fresh
  // array every call is not referentially stable and loops under useSyncExternalStore.
  const typingByUser = useTypingStore((state) => state.byUser);
  const isPeerTyping = typingUserIdsIn(typingByUser, conversationId, currentUserId).length > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenBelow, setUnseenBelow] = useState(0);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const atBottom = distance <= STICKY_THRESHOLD_PX;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setUnseenBelow(0);
    }
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    setUnseenBelow(0);
  }, []);

  /**
   * Follows new messages only when the reader is already at the bottom.
   *
   * Yanking the view down while someone is reading history is the classic chat bug, so
   * the count is kept and surfaced as a button instead.
   */
  const previousCountRef = useRef(0);
  useLayoutEffect(() => {
    const previous = previousCountRef.current;
    previousCountRef.current = messages.length;

    if (messages.length === 0) {
      return;
    }
    if (previous === 0 || isAtBottom) {
      scrollToBottom("auto");
    } else {
      setUnseenBelow(messages.length - previous);
    }
  }, [messages.length, isAtBottom, scrollToBottom]);

  /* ---------------------------------------------------------------- */
  /*                            Render states                          */
  /* ---------------------------------------------------------------- */

  if (messagesQuery.isLoading) {
    return (
      <div className="min-h-0 flex-1 overflow-hidden">
        <MessageSkeleton />
      </div>
    );
  }

  if (messagesQuery.isError) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ErrorState
          error={messagesQuery.error}
          title="طھط¹ط°ظ‘ط± طھط­ظ…ظٹظ„ ط§ظ„ط±ط³ط§ط¦ظ„"
          onRetry={() => void messagesQuery.refetch()}
          isRetrying={messagesQuery.isFetching}
          className="h-full"
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto scroll-anchor overscroll-contain px-3 py-4 sm:px-4"
      >
        {messagesQuery.hasNextPage ? (
          <div className="mb-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void messagesQuery.fetchNextPage()}
              loading={messagesQuery.isFetchingNextPage}
            >
              ط±ط³ط§ط¦ظ„ ط£ظ‚ط¯ظ…
            </Button>
          </div>
        ) : null}

        {messages.length === 0 ? (
          <FirstMessageHint name={peerName} />
        ) : (
          <ul className="space-y-0.5">
            {buildRows(messages, currentUserId, retry)}
          </ul>
        )}

        {isPeerTyping ? <TypingIndicator name={peerName} /> : null}

        {/* Scroll target. Its height also keeps the last bubble off the bottom edge. */}
        <div ref={bottomRef} className="h-1" />
      </div>

      {unseenBelow > 0 && !isAtBottom ? (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className={cn(
            "absolute bottom-3 z-10 flex items-center gap-1.5 rounded-full border border-border",
            "bg-surface px-3 py-1.5 text-xs font-medium text-fg shadow-md transition-colors hover:bg-surface-2",
            // Centred without a physical transform, so it stays correct in both directions.
            "start-1/2 -translate-x-1/2 rtl:translate-x-1/2",
          )}
        >
          <ArrowDown className="size-3.5" />
          {unseenBelow} ط¬ط¯ظٹط¯ط©
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Grouping and day dividers                        */
/* -------------------------------------------------------------------------- */

/** True when `next` continues the run that `message` belongs to. */
function continuesRun(
  message: CachedMessage,
  next: CachedMessage | undefined,
): boolean {
  if (!next) {
    return false;
  }
  const current = new Date(message.createdAt);
  const following = new Date(next.createdAt);
  return (
    next.sender.id === message.sender.id &&
    isSameDay(current, following) &&
    differenceInMinutes(following, current) < GROUP_WINDOW_MINUTES
  );
}

/**
 * Turns a flat list into rows, inserting a date divider whenever the day changes.
 *
 * Each run of messages from one sender is drawn as a group, and the timestamp plus
 * delivery status appear only on its final bubble, which is the convention every
 * messenger uses.
 */
function buildRows(
  messages: CachedMessage[],
  currentUserId: string,
  onRetry: (message: CachedMessage) => void,
) {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];

    const startsNewDay =
      !previous || !isSameDay(new Date(previous.createdAt), new Date(message.createdAt));

    return (
      <li key={message.id}>
        {startsNewDay ? <DateDivider label={formatDayDivider(message.createdAt)} /> : null}
        <MessageBubble
          message={message}
          isMine={message.sender.id === currentUserId}
          isLastInGroup={!continuesRun(message, next)}
          onRetry={() => onRetry(message)}
        />
      </li>
    );
  });
}
