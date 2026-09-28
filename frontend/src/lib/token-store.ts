/**
 * Token storage.
 *
 * Both tokens live in localStorage, which is a deliberate trade-off agreed in the
 * API contract: it keeps the backend simple and works across ports in development,
 * at the cost of exposing the tokens to any XSS bug. The alternative (httpOnly
 * refresh cookie) was considered and deferred.
 *
 * Every read is defensive. A corrupted or hand-edited entry must never crash the app,
 * so a parse failure clears the entry and reports "no session" instead of throwing.
 */

const ACCESS_TOKEN_KEY = "chatapp.accessToken";
const REFRESH_TOKEN_KEY = "chatapp.refreshToken";

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

function readRaw(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key);
    return value && value.length > 0 ? value : null;
  } catch {
    // localStorage can throw in private browsing modes.
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A full or blocked storage must not break the running session.
  }
}

function clearRaw(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do; the in-memory session is cleared either way.
  }
}

export const tokenStore = {
  getAccessToken(): string | null {
    return readRaw(ACCESS_TOKEN_KEY);
  },

  getRefreshToken(): string | null {
    return readRaw(REFRESH_TOKEN_KEY);
  },

  /** Writes both tokens and notifies subscribers so open tabs stay in sync. */
  set({ accessToken, refreshToken }: TokenPair): void {
    writeRaw(ACCESS_TOKEN_KEY, accessToken);
    writeRaw(REFRESH_TOKEN_KEY, refreshToken);
    notify();
  },

  clear(): void {
    clearRaw(ACCESS_TOKEN_KEY);
    clearRaw(REFRESH_TOKEN_KEY);
    notify();
  },

  hasSession(): boolean {
    return readRaw(ACCESS_TOKEN_KEY) !== null || readRaw(REFRESH_TOKEN_KEY) !== null;
  },
};

/* -------------------------------------------------------------------------- */
/*                          Cross-tab session sync                           */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

/** Subscribes to session changes made in this or another tab. Returns an unsubscribe. */
export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

// The `storage` event only fires in *other* tabs, which is exactly the case we need.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === ACCESS_TOKEN_KEY || event.key === REFRESH_TOKEN_KEY) {
      notify();
    }
  });
}
