import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { router } from "./router";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { RealtimeProvider } from "@/features/realtime/RealtimeProvider";
import { ApiError, NetworkError } from "@/lib/api-client";
import { RouterProvider } from "react-router";

/**
 * Whether a failure is worth retrying.
 *
 * A rejected password will be rejected again, and a 404 will still be a 404. Retrying
 * those only delays the error the user needs to see. Network failures and 5xx are
 * different, and are the ones that usually clear on their own.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) {
    return false;
  }
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 429;
  }
  return false;
}

/**
 * Server-state defaults.
 *
 * `staleTime` above zero is deliberate: these are chat queries that the socket keeps
 * fresh, and refetching on every window focus would fight the realtime layer.
 * `refetchOnWindowFocus` is off by default because the conversation list re-enables
 * it deliberately and the socket covers new message arrivals.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RealtimeProvider>
          <RouterProvider router={router} />
        </RealtimeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
