import type { MessageDTO } from '../lib/serializers.js';

// Mirrors the frame handling in app/lib/core/realtime_client.dart and
// docs/api-contract.md §4. Both sides must change together.

export type ClientFrame =
  | { type: 'auth'; payload: { token: string } }
  | { type: 'typing'; payload: { conversationId: string; isTyping: boolean } }
  | { type: 'read'; payload: { conversationId: string; messageId: string } }
  | { type: 'ping'; payload: Record<string, never> };

export type ServerFramePayloads = {
  ready: { userId: string };
  'message:new': { message: MessageDTO };
  'message:updated': { message: MessageDTO };
  typing: { conversationId: string; userId: string; isTyping: boolean };
  presence: { userId: string; isOnline: boolean; lastSeenAt: string | null };
  read: { conversationId: string; userId: string; messageId: string; readAt: string };
  pong: Record<string, never>;
  error: { code: string; message: string };
};

export type ServerFrameType = keyof ServerFramePayloads;

export type ServerFrame = {
  [K in ServerFrameType]: { type: K; payload: ServerFramePayloads[K] };
}[ServerFrameType];
