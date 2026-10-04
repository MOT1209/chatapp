import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { wsHub } from './ws-hub.js';
import { markRead } from '../services/message.service.js';
import { assertMember, getOtherMemberIds } from '../services/conversation.service.js';
import { clientFrameSchema, type ValidatedClientFrame } from '../validators/realtime.validators.js';
import type { ServerFrame } from '../types/realtime.js';

// docs/api-contract.md §4.1: the first frame must be `auth`, or the server closes
// the socket with 4401 after this many milliseconds.
const AUTH_GRACE_MS = 5_000;

// Every legitimate frame (a token, a cuid, a boolean) fits comfortably under 1KB.
// This is a DoS guard, not a business rule: `ws` aborts the connection with a
// RangeError once a single message exceeds this, which the 'error' listener
// below turns into a clean close instead of a crash.
const MAX_FRAME_BYTES = 16 * 1024;

// typing/read frames each cost 1-3 DB queries. The contract limits a client to one
// typing frame per 2s, so this ceiling is far above legitimate use; it only stops
// a hostile client from turning the socket into a query amplifier.
const DEFAULT_FRAME_LIMIT = 20;
const DEFAULT_FRAME_WINDOW_MS = 10_000;

// Protocol-level ping/pong (separate from the contract's app-level `ping` frame).
// A socket that misses one full cycle is dead: terminate it so presence is corrected.
const DEFAULT_HEARTBEAT_MS = 30_000;

type Session = { userId: string; expiresAtMs: number };

export type WsServerOptions = {
  frameLimit?: number;
  frameWindowMs?: number;
  heartbeatMs?: number;
};

export function createWsServer(httpServer: HttpServer, options: WsServerOptions = {}): WebSocketServer {
  const frameLimit = options.frameLimit ?? DEFAULT_FRAME_LIMIT;
  const frameWindowMs = options.frameWindowMs ?? DEFAULT_FRAME_WINDOW_MS;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: MAX_FRAME_BYTES });

  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!alive.has(client)) {
        client.terminate();
        continue;
      }
      alive.delete(client);
      client.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  // `WebSocketServer` itself is an EventEmitter. An unhandled 'error' here
  // (e.g. a bad upgrade request) would otherwise crash the whole process,
  // taking down every other connection with it.
  wss.on('error', (err: Error) => {
    logger.error('ws server error', { err: err.message });
  });

  wss.on('connection', (socket: WebSocket) => {
    let session: Session | null = null;
    let windowStart = Date.now();
    let framesInWindow = 0;
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    // §17: log the socket lifecycle — open, authentication outcome, close code
    // and reason. Only the user ID (after authentication) is ever attached;
    // tokens and message payloads are never logged.

    /** Sliding-ish window: true if this heavy frame is over the per-socket budget. */
    function overBudget(): boolean {
      const now = Date.now();
      if (now - windowStart >= frameWindowMs) {
        windowStart = now;
        framesInWindow = 0;
      }
      framesInWindow += 1;
      return framesInWindow > frameLimit;
    }
    // Closes the socket when the access token it authenticated with expires, so a
    // connection cannot outlive its credentials. The client refreshes and reconnects on 4401.
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let authTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!session) {
        socket.close(4401, 'auth timeout');
      }
    }, AUTH_GRACE_MS);

    // Same reasoning as wss.on('error') above, at the per-socket level: a
    // protocol violation, an oversized frame (see maxPayload), or a raw
    // network error all surface as an 'error' event on the socket. Node's
    // EventEmitter throws if nothing is listening for it — this is what
    // stands between one misbehaving client and every other user's connection.
    socket.on('error', (err: Error) => {
      logger.warn('ws socket error', { err: err.message });
    });

    socket.on('message', (raw: RawData) => {
      handleMessage(raw).catch((err: unknown) => {
        logger.error('ws message handler failed', { err: err instanceof Error ? err.message : String(err) });
      });
    });

    socket.on('close', (code: number, reason: Buffer) => {
      if (authTimer) {
        clearTimeout(authTimer);
        authTimer = null;
      }
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      logger.info('ws closed', {
        // Safe identity only; the reason string is set by this server, never
        // by the client, so it cannot smuggle arbitrary text into the logs.
        userId: session?.userId,
        code,
        reason: reason.toString('utf8'),
      });
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
        // Malformed JSON, an unknown frame type, a missing/mistyped field —
        // all collapse to the same outcome: tell the client and drop the
        // frame. The socket stays open; one bad frame is not a reason to
        // punish the rest of the session.
        send(socket, {
          type: 'error',
          payload: { code: 'VALIDATION_ERROR', message: 'Malformed or invalid frame.' },
        });
        return;
      }

      if (frame.type === 'auth') {
        if (session) {
          return; // Already authenticated; a second auth frame is a no-op.
        }
        const result = verifyAccessToken(frame.payload.token);
        if (!result.ok) {
          logger.warn('ws authentication failed', { reason: result.reason });
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
        session = { userId: result.userId, expiresAtMs: result.expiresAtMs };
        logger.info('ws authenticated', { userId: result.userId });
        // setTimeout caps at ~24.8 days; access tokens live minutes, but clamp anyway.
        const remainingMs = Math.min(Math.max(result.expiresAtMs - Date.now(), 0), 2 ** 31 - 1);
        expiryTimer = setTimeout(() => socket.close(4401, 'token expired'), remainingMs);
        if (authTimer) {
          clearTimeout(authTimer);
          authTimer = null;
        }
        try {
          await handleConnect(result.userId, socket);
        } catch (err) {
          // Presence bookkeeping failed; don't leave a registered socket the client
          // was never told is ready. Closing triggers the normal disconnect cleanup.
          logger.error('ws connect handler failed', { err: err instanceof Error ? err.message : String(err) });
          socket.close(1011, 'internal error');
          return;
        }
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
          if (overBudget()) {
            return;
          }
          await handleTyping(session.userId, frame.payload);
          return;
        case 'read':
          if (overBudget()) {
            return;
          }
          await handleRead(session.userId, frame.payload);
          return;
      }
    }
  });

  return wss;
}

// Presence writes are async; without ordering, a fast reconnect can land its
// `isOnline=true` write before the previous socket's `isOnline=false` write and
// leave a connected user stored as offline. Serialize per user, and decide from
// the hub's state at execution time rather than at scheduling time.
const presenceQueue = new Map<string, Promise<void>>();

function runPresenceTask(userId: string, task: () => Promise<void>): Promise<void> {
  const previous = presenceQueue.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  presenceQueue.set(userId, next);
  const cleanup = (): void => {
    if (presenceQueue.get(userId) === next) {
      presenceQueue.delete(userId);
    }
  };
  next.then(cleanup, cleanup);
  return next;
}

async function handleConnect(userId: string, socket: WebSocket): Promise<void> {
  const isFirstConnection = wsHub.add(userId, socket);
  if (!isFirstConnection) {
    return;
  }
  await runPresenceTask(userId, async () => {
    if (!wsHub.isOnline(userId)) {
      return; // Disconnected again before this task ran; that path owns the state.
    }
    await prisma.user.update({ where: { id: userId }, data: { isOnline: true } });
    const contacts = await getContactIds(userId);
    for (const contactId of contacts) {
      wsHub.sendToUser(contactId, { type: 'presence', payload: { userId, isOnline: true, lastSeenAt: null } });
    }
  });
}

async function handleDisconnect(userId: string, socket: WebSocket): Promise<void> {
  const wasLastConnection = wsHub.remove(userId, socket);
  if (!wasLastConnection) {
    return;
  }
  await runPresenceTask(userId, async () => {
    if (wsHub.isOnline(userId)) {
      return; // Reconnected before this task ran; the user is online.
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
  });
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

function parseFrame(raw: RawData): ValidatedClientFrame | null {
  const text = typeof raw === 'string' ? raw : raw.toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null; // Malformed JSON.
  }
  // The JSON parsed fine, but that says nothing about its shape — a client
  // (hostile or buggy) can send any JSON value at all. clientFrameSchema is
  // the actual boundary: unknown type, missing field, or wrong field type
  // all fail here rather than reaching handler code that assumes they don't.
  const result = clientFrameSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function send(socket: WebSocket, frame: ServerFrame): void {
  if (socket.readyState !== socket.OPEN) {
    return;
  }
  try {
    socket.send(JSON.stringify(frame), (err?: Error) => {
      if (err) {
        socket.terminate();
      }
    });
  } catch (err) {
    logger.warn('ws send failed', { err: err instanceof Error ? err.message : String(err) });
    socket.terminate();
  }
}
