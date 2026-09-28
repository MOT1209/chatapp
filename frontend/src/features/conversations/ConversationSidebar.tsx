import { useState } from "react";
import { Link, useParams } from "react-router";
import { MessageCircle, MessagesSquare, Plus } from "lucide-react";

import { useConversations } from "./useConversations";
import { ConversationItem, ConversationItemSkeleton } from "./ConversationItem";
import { NewConversationButton, UserSearchDialog } from "@/features/users/UserSearchDialog";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSession } from "@/features/auth/SessionProvider";
import { formatPresence } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The conversation list.
 *
 * Width is fixed rather than fluid: at tablet and desktop sizes it is a permanent
 * column, and a resizing sidebar would compete with the message thread for space.
 */
export function ConversationSidebar({ className }: { className?: string }) {
  const { user } = useSession();
  const { conversationId } = useParams();
  const [searchOpen, setSearchOpen] = useState(false);

  const conversations = useConversations();
  const items = conversations.data?.conversations ?? [];
  const isEmpty = !conversations.isLoading && !conversations.isError && items.length === 0;

  return (
    <>
      <aside
        className={cn(
          "flex h-full min-h-0 w-full flex-col border-e border-border bg-surface md:w-80",
          className,
        )}
      >
        {/* Header: identity and the two global actions. */}
        <header className="flex items-center gap-2 border-b border-border p-3">
          {user ? (
            <Link
              to="/profile"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-surface-2"
            >
              <Avatar
                name={user.displayName}
                seed={user.id}
                src={user.avatarUrl}
                size="sm"
                isOnline={user.isOnline}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">
                  {user.displayName}
                </span>
                <span className="block truncate text-[11px] text-fg-subtle">
                  {formatPresence(user.isOnline, user.lastSeenAt)}
                </span>
              </span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex items-center gap-1">
            <NewConversationButton onClick={() => setSearchOpen(true)} />
            <ThemeToggle />
          </div>
        </header>

        {/* List. Scrolls independently so the header stays put. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <nav aria-label="المحادثات" className="p-2">
            {conversations.isLoading ? (
              <div className="space-y-1">
                {Array.from({ length: 7 }, (_, index) => (
                  <ConversationItemSkeleton key={index} />
                ))}
              </div>
            ) : null}

            {conversations.isError ? (
              <ErrorState
                error={conversations.error}
                title="تعذّر تحميل المحادثات"
                onRetry={() => void conversations.refetch()}
                isRetrying={conversations.isFetching}
              />
            ) : null}

            {isEmpty ? (
              <EmptyState
                icon={MessagesSquare}
                title="لا توجد محادثات بعد"
                description="ابدأ محادثة جديدة بالبحث عن مستخدم."
                action={
                  <Button size="sm" onClick={() => setSearchOpen(true)}>
                    <Plus className="size-3.5" />
                    محادثة جديدة
                  </Button>
                }
              />
            ) : null}

            {items.length > 0 ? (
              <ul className="space-y-0.5">
                {items.map((conversation) => (
                  <li key={conversation.id}>
                    <ConversationItem
                      conversation={conversation}
                      isActive={conversation.id === conversationId}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </nav>
        </div>
      </aside>

      <UserSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

/** Shown on mobile when no conversation is selected. */
export function NoConversationSelected() {
  return (
    <EmptyState
      icon={MessageCircle}
      title="اختر محادثة"
      description="اختر محادثة من القائمة لعرض الرسائل، أو ابدأ محادثة جديدة."
      className="h-full"
    />
  );
}
