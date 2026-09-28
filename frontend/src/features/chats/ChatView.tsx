import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router";
import { ArrowRight, MessageCircleQuestion, WifiOff } from "lucide-react";

import { MessageList } from "@/features/messages/MessageList";
import { MessageInput } from "@/features/messages/MessageInput";
import { useConversations } from "@/features/conversations/useConversations";
import { useMarkConversationRead } from "@/features/realtime/cache";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { formatPresence } from "@/lib/format";
import { useSocketStatus } from "@/hooks/useSocketStatus";
import { cn } from "@/lib/cn";

/** One conversation: header, thread and composer. */
export function ChatView() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const conversations = useConversations();
  const markRead = useMarkConversationRead();
  const socketStatus = useSocketStatus();

  const conversation = useMemo(
    () => conversations.data?.conversations.find((item) => item.id === conversationId),
    [conversations.data, conversationId],
  );

  const participant = conversation?.participant;

  /**
   * Mark the thread read whenever it opens, when the tab regains focus, and whenever
   * the newest message changes while visible. A read receipt that only fires on mount
   * would be wrong the moment a message arrives in an open thread.
   */
  const newestMessageId = conversation?.lastMessage?.id ?? null;
  useEffect(() => {
    if (!conversationId || !newestMessageId) {
      return;
    }
    if (document.visibilityState === "visible") {
      markRead(conversationId, newestMessageId);
    }
  }, [conversationId, newestMessageId, markRead]);

  useEffect(() => {
    if (!conversationId || !newestMessageId) {
      return;
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        markRead(conversationId, newestMessageId);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [conversationId, newestMessageId, markRead]);

  /* The list is still loading, so the participant is not known yet. */
  if (conversations.isLoading) {
    return <ChatHeaderSkeleton />;
  }

  /* A direct link to a conversation that is not in the list: it may have been deleted,
     or belong to a different account. Saying so is clearer than an empty thread. */
  if (!conversation) {
    return (
      <div className="flex h-full flex-col">
        <MobileBackBar />
        <EmptyState
          icon={MessageCircleQuestion}
          title="ط§ظ„ظ…ط­ط§ط¯ط«ط© ط؛ظٹط± ظ…طھط§ط­ط©"
          description="ط±ط¨ظ…ط§ ط­ظڈط°ظپطھطŒ ط£ظˆ ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط§ظ„ظˆطµظˆظ„ ط¥ظ„ظٹظ‡ط§."
          className="h-full"
          action={
            <Link
              to="/chats"
              className="text-xs font-medium text-accent hover:underline"
            >
              ط§ظ„ط¹ظˆط¯ط© ط¥ظ„ظ‰ ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ
            </Link>
          }
        />
      </div>
    );
  }

  const peerName = participant?.displayName ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-2 py-2.5 sm:px-3">
        {/* Back arrow, mobile only. The sidebar is a separate pane from tablet up. */}
        <Link
          to="/chats"
          aria-label="ط§ظ„ط¹ظˆط¯ط© ط¥ظ„ظ‰ ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ"
          className="-ms-1 rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg md:hidden"
        >
          <ArrowRight className="size-5" />
        </Link>

        <Link
          to={`/profile/${participant?.id ?? ""}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-surface-2"
        >
          <Avatar
            name={peerName}
            seed={participant?.id ?? "unknown"}
            src={participant?.avatarUrl}
            size="sm"
            isOnline={participant?.isOnline}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg">{peerName}</span>
            <span className="block truncate text-[11px] text-fg-subtle">
              {formatPresence(participant?.isOnline ?? false, participant?.lastSeenAt ?? null)}
            </span>
          </span>
        </Link>
      </header>

      {/* Honest about a dropped connection rather than silently going stale. */}
      {socketStatus === "reconnecting" || socketStatus === "connecting" ? (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-border bg-warning/12 px-3 py-1.5 text-[11px] font-medium text-warning"
        >
          <WifiOff className="size-3.5 shrink-0" />
          <span className="animate-fade-in">ط¬ط§ط±ظچ ط¥ط¹ط§ط¯ط© ط§ظ„ط§طھطµط§ظ„â€¦</span>
        </div>
      ) : null}

      <MessageList
        conversationId={conversation.id}
        peerName={peerName}
        key={conversation.id}
      />

      <MessageInput conversationId={conversation.id} />
    </div>
  );
}

/** Back bar for the not-found state, which has no header of its own. */
function MobileBackBar() {
  return (
    <div className="border-b border-border bg-surface px-2 py-2 md:hidden">
      <Link
        to="/chats"
        aria-label="ط§ظ„ط¹ظˆط¯ط© ط¥ظ„ظ‰ ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ"
        className={cn("inline-flex items-center gap-1.5 rounded-md p-1.5 text-fg-muted")}
      >
        <ArrowRight className="size-5" />
      </Link>
    </div>
  );
}

function ChatHeaderSkeleton() {
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex items-center gap-2.5 border-b border-border bg-surface px-3 py-2.5">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-16" />
        </div>
      </div>
      <MessageInput conversationId="skeleton" disabled />
    </div>
  );
}
