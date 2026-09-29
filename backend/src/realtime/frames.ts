/**
 * WebSocket frame types (docs/api-contract.md §4).
 *
 * Mirrors frontend/src/lib/types.ts. Every frame is `{ type, payload }` JSON text.
 */

import type { MessageDto } from '../lib/serialize.js';

export type ClientFrame =
  | { type: 'auth'; payload: { token: string } }
  | { type: 'typing'; payload: { conversationId: string; isTyping: boolean } }
  | { type: 'read'; payload: { conversationId: string; messageId: string } }
  | { type: 'ping'; payload: Record<string, never> };

export type ServerFrame =
  | { type: 'ready'; payload: { userId: string } }
  | { type: 'message:new'; payload: { message: MessageDto } }
  | { type: 'message:updated'; payload: { message: MessageDto } }
  | { type: 'typing'; payload: { conversationId: string; userId: string; isTyping: boolean } }
  | { type: 'presence'; payload: { userId: string; isOnline: boolean; lastSeenAt: string | null } }
  | { type: 'read'; payload: { conversationId: string; userId: string; messageId: string; readAt: string } }
  | { type: 'pong'; payload: Record<string, never> }
  | { type: 'error'; payload: { code: string; message: string } };

/** What services use to push realtime events. Implemented by the connection hub. */
export interface Realtime {
  isOnline(userId: string): boolean;
  emitToUsers(userIds: Iterable<string>, frame: ServerFrame): void;
}

/** A no-op realtime used when the app runs without a WebSocket server (e.g. some tests). */
export const noopRealtime: Realtime = {
  isOnline: () => false,
  emitToUsers: () => {},
};
