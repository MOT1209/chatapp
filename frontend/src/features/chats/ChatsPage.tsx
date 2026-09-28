import { Link } from "react-router";

import { NoConversationSelected } from "@/features/conversations/ConversationSidebar";
import { useSession } from "@/features/auth/SessionProvider";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { useSocketStatus } from "@/hooks/useSocketStatus";
import { formatPresence } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The `/chats` index.
 *
 * On mobile the sidebar occupies the whole screen and this never renders. From tablet
 * up it fills the middle pane with a prompt, since a bare empty column would look like
 * something failed to load.
 */
export function ChatsPage() {
  const { user } = useSession();
  const socketStatus = useSocketStatus();

  return (
    <div className="flex h-full flex-col bg-bg">
      <ConnectionBanner status={socketStatus} />

      <div className="hidden flex-1 flex-col items-center justify-center gap-3 md:flex">
        <NoConversationSelected />

        {/* A useful next action, rather than leaving the user at a dead end. */}
        {user ? (
          <div className="-mt-6 flex flex-col items-center gap-2">
            <Avatar
              name={user.displayName}
              seed={user.id}
              src={user.avatarUrl}
              size="lg"
              isOnline={user.isOnline}
            />
            <p className="text-sm font-semibold text-fg">{user.displayName}</p>
            <p className="text-xs text-fg-subtle">
              {formatPresence(user.isOnline, user.lastSeenAt)}
            </p>
            <Link to="/profile">
              <Button variant="secondary" size="sm" className="mt-1">
                الملف الشخصي
              </Button>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Shown only when the socket is down, so the user knows messages may be delayed. */
function ConnectionBanner({ status }: { status: ReturnType<typeof useSocketStatus> }) {
  if (status !== "reconnecting" && status !== "connecting") {
    return null;
  }
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-border bg-warning/12 px-3 py-1.5 text-[11px] font-medium text-warning"
    >
      <span className={cn("size-1.5 animate-pulse rounded-full bg-warning")} />
      جارٍ الاتصال بالخادم…
    </div>
  );
}
