/**
 * REST client.
 *
 * Responsibilities, in order of importance:
 *  1. Send the access token on protected routes.
 *  2. Turn the backend's `{ error: { code, message, fields } }` envelope into a
 *     typed `ApiError`, so components never inspect a raw Response.
 *  3. On `TOKEN_EXPIRED`, refresh once and retry. Concurrent 401s share one refresh.
 *  4. Surface network failures distinctly, so the UI can say "offline" rather than
 *     "server error".
 *
 * Errors from the backend are never rewritten. `ApiError.message` is the backend's
 * own message, and it is what the user sees when a request fails.
 */

import { tokenStore } from "./token-store";
import type { ApiErrorBody } from "./api-error";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000";

/** Thrown by every failed request. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** Field-level messages, present on validation failures. */
  readonly fields: Record<string, string> | undefined;

  constructor(body: ApiErrorBody, status: number) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.status = status;
    this.fields = body.fields;
  }
}

/** The request never reached the server, or the server never answered. */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Set false for the login and register calls, which must not carry a token. */
  auth?: boolean;
  signal?: AbortSignal;
};

type RefreshHandler = () => Promise<boolean>;

let refreshHandler: RefreshHandler | null = null;
/** Lets the auth layer decide what a refresh failure means, without this file importing React. */
export function setRefreshHandler(handler: RefreshHandler | null): void {
  refreshHandler = handler;
}

const listeners = new Set<() => void>();
/** Fired when the session is dead and the user must sign in again. */
export function onSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function announceSessionExpired(): void {
  for (const listener of listeners) {
    listener();
  }
}

/* -------------------------------------------------------------------------- */
/*                              Token refresh                                 */
/* -------------------------------------------------------------------------- */

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Runs the refresh at most once at a time.
 *
 * Without this, opening a page that fires four parallel queries would trigger four
 * refreshes and rotate the refresh token four times, invalidating itself.
 */
function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        if (!refreshHandler) {
          return false;
        }
        return await refreshHandler();
      } finally {
        // Cleared on the next tick so simultaneous callers all await the same promise.
        queueMicrotask(() => {
          refreshInFlight = null;
        });
      }
    })();
  }
  return refreshInFlight;
}

/* -------------------------------------------------------------------------- */
/*                              Core request                                 */
/* -------------------------------------------------------------------------- */

function isRetryable(expired: ApiError): boolean {
  return expired.code === "TOKEN_EXPIRED";
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Normalises anything that is not the agreed envelope into a usable ApiErrorBody. */
function toErrorBody(raw: unknown, status: number): ApiErrorBody {
  if (raw !== null && typeof raw === "object" && "error" in raw) {
    const candidate = (raw as { error: unknown }).error;
    if (candidate !== null && typeof candidate === "object") {
      const { code, message, fields } = candidate as Partial<ApiErrorBody>;
      if (typeof code === "string" && typeof message === "string") {
        return {
          code,
          message,
          fields:
            fields !== null && typeof fields === "object"
              ? (fields as Record<string, string>)
              : undefined,
        };
      }
    }
  }
  // The backend broke its own contract. Say so plainly rather than inventing a cause.
  return {
    code: "UNEXPECTED_RESPONSE",
    message: `Unexpected response from the server (HTTP ${status}).`,
  };
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, auth = true, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = tokenStore.getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause;
    }
    throw new NetworkError("Cannot reach the server. Check your connection and try again.", {
      cause,
    });
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await rawRequest(path, options);

  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await parseBody(response)) as T;
  }

  const error = new ApiError(toErrorBody(await parseBody(response), response.status), response.status);

  if (error.status === 401 && isRetryable(error)) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      // Exactly one retry. If the retry also fails, that error is what the user sees.
      const retried = await rawRequest(path, options);
      if (retried.ok) {
        if (retried.status === 204) {
          return undefined as T;
        }
        return (await parseBody(retried)) as T;
      }
      throw new ApiError(
        toErrorBody(await parseBody(retried), retried.status),
        retried.status,
      );
    }
  }

  if (error.status === 401) {
    tokenStore.clear();
    announceSessionExpired();
  }

  throw error;
}

export const apiClient = {
  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: "GET", signal });
  },

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "POST", body });
  },

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "PATCH", body });
  },

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "DELETE" });
  },

  /** POST that expects no response body, for endpoints documented as returning 204. */
  async postVoid(path: string, body?: unknown, options?: RequestOptions): Promise<void> {
    await request<undefined>(path, { ...options, method: "POST", body });
  },
};

export { refreshOnce };
