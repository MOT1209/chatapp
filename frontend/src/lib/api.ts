/**
 * Endpoint functions.
 *
 * One exported function per route in docs/api-contract.md. Components and hooks
 * call these instead of `apiClient` directly, so there is exactly one place where a
 * URL or a payload shape is written down. Changing the contract means changing this
 * file and nothing else.
 */

import { apiClient } from "./api-client";
import type {
  AuthResponse,
  Conversation,
  ConversationListResponse,
  LoginInput,
  MessagesPage,
  RefreshResponse,
  RegisterInput,
  UpdateProfileInput,
  User,
  UserSearchResponse,
} from "./types";

/* -------------------------------------------------------------------------- */
/*                                    Auth                                    */
/* -------------------------------------------------------------------------- */

export const authApi = {
  register(input: RegisterInput): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>("/api/auth/register", input, { auth: false });
  },

  login(input: LoginInput): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>("/api/auth/login", input, { auth: false });
  },

  refresh(refreshToken: string): Promise<RefreshResponse> {
    return apiClient.post<RefreshResponse>("/api/auth/refresh", { refreshToken }, { auth: false });
  },

  /** Best-effort. A failure here must never block the user from signing out. */
  async logout(): Promise<void> {
    try {
      await apiClient.postVoid("/api/auth/logout");
    } catch {
      // Intentionally swallowed: the client clears its own session regardless.
    }
  },

  forgotPassword(email: string): Promise<void> {
    return apiClient.postVoid("/api/auth/forgot-password", { email }, { auth: false });
  },

  resetPassword(token: string, newPassword: string): Promise<void> {
    return apiClient.postVoid(
      "/api/auth/reset-password",
      { token, newPassword },
      { auth: false },
    );
  },
};

/* -------------------------------------------------------------------------- */
/*                                   Users                                    */
/* -------------------------------------------------------------------------- */

export const usersApi = {
  me(signal?: AbortSignal): Promise<User> {
    return apiClient.get<User>("/api/users/me", signal);
  },

  search(query: string, signal?: AbortSignal): Promise<UserSearchResponse> {
    return apiClient.get<UserSearchResponse>(
      `/api/users/search?q=${encodeURIComponent(query)}&limit=20`,
      signal,
    );
  },

  byId(id: string, signal?: AbortSignal): Promise<User> {
    return apiClient.get<User>(`/api/users/${encodeURIComponent(id)}`, signal);
  },

  updateProfile(input: UpdateProfileInput): Promise<User> {
    return apiClient.patch<User>("/api/users/me", input);
  },
};

/* -------------------------------------------------------------------------- */
/*                               Conversations                                */
/* -------------------------------------------------------------------------- */

export const conversationsApi = {
  list(signal?: AbortSignal): Promise<ConversationListResponse> {
    return apiClient.get<ConversationListResponse>("/api/conversations", signal);
  },

  /** Idempotent by contract: returns the existing conversation rather than a duplicate. */
  create(participantId: string): Promise<Conversation> {
    return apiClient.post<Conversation>("/api/conversations", { participantId });
  },

  messages(
    conversationId: string,
    cursor: string | null,
    limit = 30,
    signal?: AbortSignal,
  ): Promise<MessagesPage> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      params.set("cursor", cursor);
    }
    return apiClient.get<MessagesPage>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
      signal,
    );
  },

  /** POSTs a message. The backend de-duplicates on `(senderId, clientId)`. */
  send(conversationId: string, clientId: string, body: string) {
    return apiClient.post<import("./types").Message>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      { clientId, body },
    );
  },

  markRead(conversationId: string, messageId: string): Promise<void> {
    return apiClient.postVoid(
      `/api/conversations/${encodeURIComponent(conversationId)}/read`,
      { messageId },
    );
  },
};
