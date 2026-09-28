import { Navigate, Outlet, useLocation } from "react-router";
import { Loader2 } from "lucide-react";

import { useSession } from "./SessionProvider";

/** Shown while the stored token is being validated on boot. */
function SplashScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <Loader2 className="size-6 animate-spin text-fg-subtle" aria-label="جارٍ التحميل" />
    </div>
  );
}

/**
 * Gate for authenticated routes.
 *
 * Waits for the session to resolve before deciding. Redirecting during the loading
 * phase would sign every signed-in user out on each page refresh.
 */
export function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();

  if (status === "loading") {
    return <SplashScreen />;
  }

  if (status === "unauthenticated") {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/** Keeps a signed-in user off the login and register screens. */
export function RedirectIfAuthenticated() {
  const { status } = useSession();

  if (status === "loading") {
    return <SplashScreen />;
  }

  if (status === "authenticated") {
    return <Navigate to="/chats" replace />;
  }

  return <Outlet />;
}
