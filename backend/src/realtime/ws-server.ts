import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { wsHub } from './ws-hub.js';
import { markRead } from '../services/message.service.js';
import { assertMember, getOtherMemberIds } from '../services/conversation.service.js';
import type { ClientFrame, ServerFrame } from '../types/realtime.js';

// docs/api-contract.md §4.1: the first frame must be `auth`, or the server closes
// the socket with 4401 after this many milliseconds.
const AUTH_GRACE_MS = 5_000;

type Session = { userId: string };

export function createWsServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket: WebSocket) => {
    let session: Session | null = null;
    let authTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!session) {
        socket.close(4401, 'auth timeout');
      }
    }, AUTH_GRACE_MS);

    socket.on('message', (raw: RawData) => {
      handleMessage(raw).catch((err: unknown) => {
        logger.error('ws message handler failed', { err: err instanceof Error ? err.message : String(err) });
      });
    });

    socket.on('close', () => {
      if (authTimer) {
        clearTimeout(authTimer);
        authTimer = null;
      }
      if (session) {
        const { userId } = session;
        handleDisconnect(userId, socket).catch((err: unknown) => {
          logger.error('ws disconnect handler failed', { err: err instanceof Error ? err.message : String(err) });
        });
      }
    });

    async function handleMessage(raw: RawData): Promise<void> {
      const frame = parseFrame(raw);
      if (!frame) {
        return;
      }

      if (frame.type === 'auth') {
        if (session) {
          return; // Already authenticated; a second auth frame is a no-op.
        }
        const result = verifyAccessToken(frame.payload.token);
        if (!result.ok) {
          send(socket, {
            type: 'error',
            payload: {
              code: result.reason === 'expired' ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED',
              message: 'Invalid or expired access token.',
            },
          });
          socket.close(4401, 'invalid token');
          return;
        }
        session = { userId: result.userId };
        if (authTimer) {
          clearTimeout(authTimer);
          authTimer = null;
        }
        await handleConnect(result.userId, socket);
        send(socket, { type: 'ready', payload: { userId: result.userId } });
        return;
      }

      if (!session) {
        send(socket, {
          type: 'error',
          payload: { code: 'UNAUTHENTICATED', message: 'Send an auth frame first.' },
        });
        return;
      }

      switch (frame.type) {
        case 'ping':
          send(socket, { type: 'pong', payload: {} });
          return;
        case 'typing':
          await handleTyping(session.userId, frame.payload);
          return;
        case 'read':
          await handleRead(session.userId, frame.payload);
          return;
      }
    }
  });

  return wss;
}

async function handleConnect(userId: string, socket: WebSocket): Promise<void> {
  const isFirstConnection = wsHub.add(userId, socket);
  if (!isFirstConnection) {
    return;
  }
  await prisma.user.update({ where: { id: userId }, data: { isOnline: true } });
  const contacts = await getContactIds(userId);
  for (const contactId of contacts) {
    wsHub.sendToUser(contactId, { type: 'presence', payload: { userId, isOnline: true, lastSeenAt: null } });
  }
}

async function handleDisconnect(userId: string, socket: WebSocket): Promise<void> {
  const wasLastConnection = wsHub.remove(userId, socket);
  if (!wasLastConnection) {
    return;
  }
  const lastSeenAt = new Date();
  await prisma.user.update({ where: { id: userId }, data: { isOnline: false, lastSeenAt } });
  const contacts = await getContactIds(userId);
  for (const contactId of contacts) {
    wsHub.sendToUser(contactId, {
      type: 'presence',
      payload: { userId, isOnline: false, lastSeenAt: lastSeenAt.toISOString() },
    });
  }
}

async function handleTyping(
  userId: string,
  payload: { conversationId: string; isTyping: boolean },
): Promise<void> {
  try {
    await assertMember(payload.conversationId, userId);
  } catch {
    return; // Unknown or foreign conversationId — drop the signal silently.
  }
  const others = await getOtherMemberIds(payload.conversationId, userId);
  for (const otherId of others) {
    wsHub.sendToUser(otherId, {
      type: 'typing',
      payload: { conversationId: payload.conversationId, userId, isTyping: payload.isTyping },
    });
  }
}

async function handleRead(
  userId: string,
  payload: { conversationId: string; messageId: string },
): Promise<void> {
  try {
    // Reuses the REST read path so both entry points produce the same effect,
    // per docs/api-contract.md §4.3 — including the `read` broadcast it sends.
    await markRead(userId, payload.conversationId, payload.messageId);
  } catch (err) {
    logger.warn('ws read frame failed', { userId, err: err instanceof Error ? err.message : String(err) });
  }
}

/** Users who share a direct conversation with `userId` — the presence broadcast audience. */
async function getContactIds(userId: string): Promise<string[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
  });
  const conversationIds = memberships.map((m) => m.conversationId);
  if (conversationIds.length === 0) {
    return [];
  }
  const others = await prisma.conversationMember.findMany({
    where: { conversationId: { in: conversationIds }, userId: { not: userId } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return others.map((o) => o.userId);
}

function parseFrame(raw: RawData): ClientFrame | null {
  const text = typeof raw === 'string' ? raw : raw.toString('utf8');
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed !== null && typeof parsed === 'object' && typeof (parsed as { type?: unknown }).type === 'string') {
      return parsed as ClientFrame;
    }
    return null;
  } catch {
    return null; // A malformed frame is dropped; the socket stays open.
  }
}

function send(socket: WebSocket, frame: ServerFrame): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(frame));
  }
}
