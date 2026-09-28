import { Navigate, createBrowserRouter } from "react-router";

import { AppShell } from "@/features/chats/AppShell";
import { ChatsPage } from "@/features/chats/ChatsPage";
import { ChatView } from "@/features/chats/ChatView";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { RedirectIfAuthenticated, RequireAuth } from "@/features/auth/RouteGuards";
import { ProfilePage, UserProfilePage } from "@/features/profile/ProfilePages";
import { NotFoundPage } from "@/features/chats/NotFoundPage";

/**
 * Routes.
 *
 * Two guarded groups. Unauthenticated visitors cannot reach the app, and
 * authenticated users are bounced off the login and register screens.
 *
 * `AppShell` owns the three-pane layout and renders its own `Outlet`, so the
 * conversation and profile routes nest inside it without a pathless layout route.
 */
export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <Navigate to="/chats" replace /> },
          { path: "/chats", element: <ChatsPage /> },
          // `key` on ChatView remounts it per conversation, which resets the
          // message list scroll and the composer without extra bookkeeping.
          { path: "/chats/:conversationId", element: <ChatView /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/profile/:userId", element: <UserProfilePage /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
