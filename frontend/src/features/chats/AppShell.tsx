import { Outlet, useLocation } from "react-router";

import { ConversationSidebar } from "@/features/conversations/ConversationSidebar";
import { ProfilePanel } from "@/features/profile/ProfilePanel";
import { useSession } from "@/features/auth/SessionProvider";
import { cn } from "@/lib/cn";

/**
 * The application shell.
 *
 * Three genuinely different layouts rather than one layout at three widths:
 *
 *  - Mobile  (<768px)  one pane. The sidebar fills the screen, and opening a
 *                      conversation or a profile replaces it, with a back control.
 *  - Tablet  (768px+)   two panes. A fixed 320px sidebar beside the content.
 *  - Desktop (1024px+)  three panes. Sidebar, content, and a 320px details panel.
 *
 * The panes are always mounted on md and up, so switching between conversations keeps
 * the sidebar and its scroll position instead of rebuilding them.
 */
export function AppShell() {
  const { user } = useSession();
  const { pathname } = useLocation();

  // On mobile a detail route takes over the screen, so the sidebar steps aside.
  const isDetailRoute =
    /^\/chats\/[^/]+/.test(pathname) || pathname.startsWith("/profile");

  return (
    <div
      className={cn(
        "flex h-dvh w-full overflow-hidden bg-bg",
        // On mobile only one pane is visible, so the row becomes a stack.
        "flex-col md:flex-row",
      )}
    >
      <div
        className={cn(
          "min-h-0 w-full shrink-0 md:flex md:h-full",
          isDetailRoute ? "hidden md:flex" : "flex",
          "md:w-80",
        )}
      >
        <ConversationSidebar className="md:w-full" />
      </div>

      {/* Content. Hidden on mobile when the sidebar is showing. */}
      <main
        className={cn(
          "min-h-0 min-w-0 flex-1",
          isDetailRoute ? "flex flex-col" : "hidden md:flex md:flex-col",
        )}
      >
        <Outlet />
      </main>

      {/*
        Desktop-only details panel. `xl` rather than `lg`: at 1024px, two 320px
        columns plus a usable thread leaves the message column too narrow.

        Hidden on the profile routes, where the centre pane already shows the profile.
        Showing it twice would be confusing and would duplicate the form.
      */}
      {pathname.startsWith("/profile") ? null : (
        <aside className="hidden min-h-0 w-80 shrink-0 border-s border-border bg-surface xl:flex xl:flex-col">
          <ProfilePanel userId={routeUserId(pathname)} currentUser={user} />
        </aside>
      )}
    </div>
  );
}

/**
 * Which profile the details panel should show.
 *
 * `/profile/me` and `/profile` mean the signed-in user. A path such as
 * `/profile/u_2` means that other user, which is what the chat header links to.
 */
function routeUserId(pathname: string): string | null {
  const match = /^\/profile\/([^/]+)/.exec(pathname);
  if (!match?.[1]) {
    return null;
  }
  return match[1] === "me" ? null : match[1];
}
