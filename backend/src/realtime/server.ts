/**
 * WebSocket server (docs/api-contract.md §4).
 *
 * Raw JSON frames. The first frame must be `auth`; a socket that does not authenticate
 * within 5s is closed with 4401. After auth the server handles ping/typing/read and
 * fans out message/presence/read events. Every inbound frame is guarded so a malformed,
 * unknown, oversized, or hostile frame can never crash the process — at worst the sender
 * gets an `error` frame or a closed socket.
 */

import type { Server } from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { AppContext } from '../context.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { markConversationRead } from '../services/message.service.js';
import type { ConnectionHub } from './hub.js';
import type { ServerFrame } from './frames.js';

const AUTH_GRACE_MS = 5_000;
const MAX_FRAME_BYTES = 64 * 1024;

interface SocketState {
  userId: string | null;
  authTimer: ReturnType<typeof setTimeout> | null;
}

function send(socket: WebSocket, frame: ServerFrame): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(frame));
  }
}

function sendError(socket: WebSocket, code: string, message: string): void {
  send(socket, { type: 'error', payload: { code, message } });
}

/** Collects the ids of everyone who shares a conversation with `userId`. */
async function partnerIds(ctx: AppContext, userId: string): Promise<string[]> {
  const conversations = await ctx.store.listConversationsForUser(userId);
  const ids = new Set<string>();
  for (const conversation of conversations) {
    const members = await ctx.store.listMembers(conversation.id);
    for (const member of members) {
      if (member.userId !== userId) ids.add(member.userId);
    }
  }
  return [...ids];
}

export function attachRealtime(server: Server, ctx: AppContext, hub: ConnectionHub): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_FRAME_BYTES });

  wss.on('connection', (socket: WebSocket) => {
    const state: SocketState = { userId: null, authTimer: null };

    state.authTimer = setTimeout(() => {
      if (!state.userId) {
        socket.close(4401, 'auth timeout');
      }
    }, AUTH_GRACE_MS);

    socket.on('message', (raw: RawData) => {
      void handleFrame(socket, state, raw).catch((err) => {
        logger.error('ws frame handler failed', { err: err instanceof Error ? err.message : String(err) });
      });
    });

    socket.on('close', () => {
      if (state.authTimer) clearTimeout(state.authTimer);
      if (!state.userId) return;
      const userId = state.userId;
      const wasLast = hub.unregister(userId, socket);
      if (wasLast) {
        void onUserOffline(userId).catch((err) => {
          logger.error('presence offline failed', { err: err instanceof Error ? err.message : String(err) });
        });
      }
    });

    socket.on('error', (err: Error) => {
      logger.warn('ws socket error', { err: err.message });
    });
  });

  async function onUserOnline(userId: string): Promise<void> {
    await ctx.store.updateUserPresence(userId, 'online', null);
    hub.emitToUsers(await partnerIds(ctx, userId), {
      type: 'presence',
      payload: { userId, isOnline: true, lastSeenAt: null },
    });
  }

  async function onUserOffline(userId: string): Promise<void> {
    const now = new Date();
    await ctx.store.updateUserPresence(userId, 'offline', now);
    hub.emitToUsers(await partnerIds(ctx, userId), {
      type: 'presence',
      payload: { userId, isOnline: false, lastSeenAt: now.toISOString() },
    });
  }

  async function handleFrame(socket: WebSocket, state: SocketState, raw: RawData): Promise<void> {
    const frame = parseFrame(raw);
    if (!frame) {
      sendError(socket, 'VALIDATION_ERROR', 'Malformed frame.');
      return;
    }

    // Everything except `auth` requires an authenticated socket.
    if (!state.userId) {
      if (frame.type !== 'auth') {
        sendError(socket, 'UNAUTHENTICATED', 'Authenticate before sending frames.');
        return;
      }
      await handleAuth(socket, state, frame.payload);
      return;
    }

    switch (frame.type) {
      case 'ping':
        send(socket, { type: 'pong', payload: {} });
        return;
      case 'typing':
        await handleTyping(socket, state.userId, frame.payload);
        return;
      case 'read':
        await handleRead(socket, state.userId, frame.payload);
        return;
      case 'auth':
        // Already authenticated; ignore a duplicate auth rather than re-registering.
        return;
      default:
        sendError(socket, 'VALIDATION_ERROR', `Unknown frame type: ${String(frame.type)}`);
    }
  }

  async function handleAuth(socket: WebSocket, state: SocketState, payload: unknown): Promise<void> {
    const token = isRecord(payload) && typeof payload.token === 'string' ? payload.token : null;
    if (!token) {
      sendError(socket, 'UNAUTHENTICATED', 'A token is required.');
      socket.close(4401, 'unauthenticated');
      return;
    }
    let userId: string;
    try {
      userId = verifyAccessToken(token);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'UNAUTHENTICATED';
      sendError(socket, code, err instanceof Error ? err.message : 'Invalid token.');
      socket.close(4401, 'unauthenticated');
      return;
    }

    if (state.authTimer) clearTimeout(state.authTimer);
    state.userId = userId;
    const firstConnection = hub.register(userId, socket);
    send(socket, { type: 'ready', payload: { userId } });
    if (firstConnection) {
      await onUserOnline(userId);
    }
  }

  async function handleTyping(socket: WebSocket, userId: string, payload: unknown): Promise<void> {
    if (!isRecord(payload) || typeof payload.conversationId !== 'string' || typeof payload.isTyping !== 'boolean') {
      sendError(socket, 'VALIDATION_ERROR', 'Invalid typing payload.');
      return;
    }
    const { conversationId, isTyping } = payload;
    const members = await ctx.store.listMembers(conversationId);
    if (!members.some((m) => m.userId === userId)) {
      sendError(socket, 'FORBIDDEN', 'You are not a member of this conversation.');
      return;
    }
    const others = members.map((m) => m.userId).filter((id) => id !== userId);
    hub.emitToUsers(others, { type: 'typing', payload: { conversationId, userId, isTyping } });
  }

  async function handleRead(socket: WebSocket, userId: string, payload: unknown): Promise<void> {
    if (!isRecord(payload) || typeof payload.conversationId !== 'string' || typeof payload.messageId !== 'string') {
      sendError(socket, 'VALIDATION_ERROR', 'Invalid read payload.');
      return;
    }
    try {
      await markConversationRead(ctx, userId, payload.conversationId, payload.messageId);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'SERVER_ERROR';
      sendError(socket, code, err instanceof Error ? err.message : 'Could not mark as read.');
    }
  }

  return wss;
}

function parseFrame(raw: RawData): { type: string; payload: unknown } | null {
  let text: string;
  if (typeof raw === 'string') {
    text = raw;
  } else if (Buffer.isBuffer(raw)) {
    text = raw.toString('utf8');
  } else if (raw instanceof ArrayBuffer) {
    text = Buffer.from(raw).toString('utf8');
  } else {
    text = Buffer.concat(raw as Buffer[]).toString('utf8');
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed) && typeof parsed.type === 'string') {
      return { type: parsed.type, payload: parsed.payload };
    }
    return null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
