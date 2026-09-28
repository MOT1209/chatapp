/**
 * Session.
 *
 * Owns the current user and the sign-in lifecycle. Everything else in the app reads
 * the session from here rather than touching token storage directly.
 *
 * On boot it validates any stored token against `GET /api/users/me`. That one call
 * is what distinguishes "still signed in" from "holding an expired token", and it is
 * why the app shows a splash rather than flashing the login screen on every refresh.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { authApi, usersApi } from "@/lib/api";
import { onSessionExpired, setRefreshHandler } from "@/lib/api-client";
import { onSessionChange, tokenStore } from "@/lib/token-store";
import { chatSocket } from "@/lib/socket";
import { queryKeys } from "@/lib/query-keys";
import type { LoginInput, RegisterInput, User } from "@/lib/types";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SessionContextValue = {
  status: SessionStatus;
  user: User | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the profile, e.g. after editing it. */
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const queryClient = useQueryClient();

  // Read through a ref so the refresh handler never closes over stale state.
  const statusRef = useRef<SessionStatus>("loading");
  statusRef.current = status;

  const signOutLocally = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus("unauthenticated");
    chatSocket.disconnect();
    // Every cached response belongs to the session that just ended.
    queryClient.clear();
  }, [queryClient]);

  /* ------------------------------------------------------------------ */
  /*                          Token refresh hook                         */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    setRefreshHandler(async () => {
      const refreshToken = tokenStore.getRefreshToken();
      if (!refreshToken) {
        return false;
      }
      try {
        const tokens = await authApi.refresh(refreshToken);
        tokenStore.set(tokens);
        return true;
      } catch {
        // The refresh token is gone or revoked. The session is over.
        return false;
      }
    });
    return () => setRefreshHandler(null);
  }, []);

  /* ------------------------------------------------------------------ */
  /*                         Bootstrapping session                       */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!tokenStore.getAccessToken()) {
        if (!cancelled) {
          setStatus("unauthenticated");
        }
        return;
      }

      try {
        const me = await usersApi.me();
        if (cancelled) {
          return;
        }
        setUser(me);
        setStatus("authenticated");
        chatSocket.connect();
      } catch {
        if (cancelled) {
          return;
        }
        // The stored token is not usable. Clear it rather than retrying forever.
        tokenStore.clear();
        setStatus("unauthenticated");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /*                       Cross-tab session sync                        */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    // Another tab signed out. Follow it without a round trip.
    return onSessionChange(() => {
      if (!tokenStore.hasSession() && statusRef.current === "authenticated") {
        setUser(null);
        setStatus("unauthenticated");
        chatSocket.disconnect();
        queryClient.clear();
      }
    });
  }, [queryClient]);

  useEffect(() => onSessionExpired(signOutLocally), [signOutLocally]);

  /* ------------------------------------------------------------------ */
  /*                              Actions                               */
  /* ------------------------------------------------------------------ */

  const login = useCallback(async (input: LoginInput) => {
    const result = await authApi.login(input);
    tokenStore.set({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    setUser(result.user);
    setStatus("authenticated");
    chatSocket.connect();
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await authApi.register(input);
    tokenStore.set({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    setUser(result.user);
    setStatus("authenticated");
    chatSocket.connect();
  }, []);

  const logout = useCallback(async () => {
    // Tell the backend first so it can revoke the refresh token, then drop
    // everything locally. A failure here still results in a signed-out user.
    await authApi.logout();
    signOutLocally();
  }, [signOutLocally]);

  const refreshUser = useCallback(async () => {
    const me = await usersApi.me();
    setUser(me);
    queryClient.setQueryData(queryKeys.currentUser, me);
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({ status, user, login, register, logout, refreshUser, setUser }),
    [status, user, login, register, logout, refreshUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside a <SessionProvider>.");
  }
  return context;
}
