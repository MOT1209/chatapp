import { useParams, Link } from "react-router";
import { ArrowRight } from "lucide-react";

import { LogoutSection, ProfilePanel } from "./ProfilePanel";
import { useSession } from "@/features/auth/SessionProvider";

/** `/profile` — the signed-in user's own profile, with editing and logout. */
export function ProfilePage() {
  const { user } = useSession();

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <ProfileBackBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg bg-surface shadow-sm">
          <ProfilePanel userId={null} currentUser={user} />
          <LogoutSection />
        </div>
      </div>
    </div>
  );
}

/** `/profile/:userId` — someone else's profile, read only. */
export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useSession();

  // A profile for oneself is the same screen as `/profile`, so redirect rather than
  // showing a read-only version of your own details.
  if (user && userId === user.id) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        <ProfileBackBar />
        <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto bg-surface shadow-sm">
          <ProfilePanel userId={null} currentUser={user} />
          <LogoutSection />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <ProfileBackBar />
      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto bg-surface shadow-sm">
        <ProfilePanel userId={userId ?? null} currentUser={user} />
      </div>
    </div>
  );
}

/** Back link. Present on mobile only; the sidebar already sits beside this on wider screens. */
function ProfileBackBar() {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-2 py-2.5 md:hidden">
      <Link
        to="/chats"
        aria-label="العودة إلى المحادثات"
        className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <ArrowRight className="size-5" />
      </Link>
      <span className="text-sm font-semibold text-fg">الملف الشخصي</span>
    </div>
  );
}
