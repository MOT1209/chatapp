import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Search, UserPlus } from "lucide-react";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { UserSkeleton } from "@/components/Skeleton";
import { NoSearchResults } from "@/features/conversations/ConversationItem";
import { useUserSearch } from "./useUserSearch";
import { conversationsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/features/auth/SessionProvider";

/**
 * Finds a user and opens a conversation with them.
 *
 * `POST /conversations` is idempotent by contract, so picking someone who already has
 * a conversation just navigates to it. That is why there is no separate "already
 * chatting" branch to get wrong.
 */
export function UserSearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useSession();

  const search = useUserSearch(query);

  const startConversation = useMutation({
    mutationFn: (participantId: string) => conversationsApi.create(participantId),
    onSuccess: (conversation) => {
      // The new conversation now belongs in the list, sorted by `updatedAt`.
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
      setQuery("");
      onClose();
      navigate(`/chats/${conversation.id}`);
    },
  });

  function handleClose() {
    setQuery("");
    onClose();
  }

  const results = search.data?.users ?? [];
  const showSkeleton = search.isFetching && query.trim().length >= 2 && results.length === 0;
  const showNoResults =
    !search.isFetching && query.trim().length >= 2 && results.length === 0 && !search.isError;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="محادثة جديدة"
      description="ابحث عن مستخدم باسم المستخدم أو الاسم المعروض"
    >
      <div className="p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-fg-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            // `autoFocus` on an input the user expects to type into.
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن مستخدم…"
            aria-label="ابحث عن مستخدم"
            className="h-10 w-full rounded-md border border-border bg-surface-2 ps-3 pe-9 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
          />
        </div>

        <div className="mt-3 max-h-72 overflow-y-auto">
          {query.trim().length < 2 ? (
            <EmptyState
              icon={UserPlus}
              title="ابحث عن مستخدم"
              description="اكتب حرفين على الأقل للبحث في أسماء المستخدمين والأسماء المعروضة."
              className="py-6"
            />
          ) : null}

          {showSkeleton ? <UserSkeleton /> : null}

          {search.isError ? (
            <ErrorState
              error={search.error}
              onRetry={() => void search.refetch()}
              isRetrying={search.isFetching}
            />
          ) : null}

          {showNoResults ? <NoSearchResults /> : null}

          <ul className="space-y-0.5">
            {results.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  // The backend excludes the current user, but filter again so a
                  // backend slip can never let you start a chat with yourself.
                  disabled={person.id === currentUser?.id || startConversation.isPending}
                  onClick={() => startConversation.mutate(person.id)}
                  className="flex w-full items-center gap-3 rounded-lg p-2.5 text-start transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Avatar
                    name={person.displayName}
                    seed={person.id}
                    src={person.avatarUrl}
                    size="sm"
                    isOnline={person.isOnline}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {person.displayName}
                    </span>
                    <span dir="ltr" className="block truncate text-xs text-fg-subtle">
                      @{person.username}
                    </span>
                  </span>
                  <MessageSquarePlus className="size-4 shrink-0 text-fg-subtle" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {startConversation.isError ? (
        <div className="border-t border-border p-3">
          <ErrorState
            error={startConversation.error}
            title="تعذّر فتح المحادثة"
            onRetry={() => {
              const id = startConversation.variables;
              if (id) {
                startConversation.mutate(id);
              }
            }}
            isRetrying={startConversation.isPending}
            className="py-4"
          />
        </div>
      ) : null}
    </Modal>
  );
}

/** The sidebar's "new conversation" trigger, including its empty-state variant. */
export function NewConversationButton({
  onClick,
  variant = "icon",
}: {
  onClick: () => void;
  variant?: "icon" | "full";
}) {
  if (variant === "full") {
    return (
      <Button onClick={onClick} className="w-full">
        <UserPlus className="size-4" />
        محادثة جديدة
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="محادثة جديدة"
      title="محادثة جديدة"
      className="rounded-md p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <UserPlus className="size-4.5" />
    </button>
  );
}
