import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { WebSocket, type RawData } from 'ws';
import request from 'supertest';
import type { WebSocket as WsSocket } from 'ws';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { wsHub } from '../src/realtime/ws-hub.js';
import { createWsServer } from '../src/realtime/ws-server.js';
import * as authService from '../src/services/auth.service.js';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';

type FakeSocket = {
  OPEN: number;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};

function fakeSocket(sendImpl?: () => void): FakeSocket {
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn(sendImpl),
    terminate: vi.fn(),
  };
}

const asWs = (s: FakeSocket): WsSocket => s as unknown as WsSocket;
const frame = { type: 'pong', payload: {} } as const;

describe('wsHub.sendToUser resilience', () => {
  it('does not throw when send() throws, still serves the other sockets, and terminates the broken one', () => {
    const broken = fakeSocket(() => {
      throw new Error('socket closed between check and send');
    });
    const healthy = fakeSocket();
    wsHub.add('hub-user-1', asWs(broken));
    wsHub.add('hub-user-1', asWs(healthy));
    try {
      expect(() => wsHub.sendToUser('hub-user-1', frame)).not.toThrow();
      expect(healthy.send).toHaveBeenCalledTimes(1);
      expect(broken.terminate).toHaveBeenCalledTimes(1);
      expect(healthy.terminate).not.toHaveBeenCalled();
    } finally {
      wsHub.remove('hub-user-1', asWs(broken));
      wsHub.remove('hub-user-1', asWs(healthy));
    }
  });

  it('terminates a socket whose asynchronous send callback reports an error', () => {
    const socket = fakeSocket();
    socket.send.mockImplementation((_data: string, cb?: (err?: Error) => void) => cb?.(new Error('EPIPE')));
    wsHub.add('hub-user-2', asWs(socket));
    try {
      wsHub.sendToUser('hub-user-2', frame);
      expect(socket.terminate).toHaveBeenCalledTimes(1);
    } finally {
      wsHub.remove('hub-user-2', asWs(socket));
    }
  });

  it('skips sockets that are no longer OPEN', () => {
    const closing = fakeSocket();
    closing.readyState = 2;
    wsHub.add('hub-user-3', asWs(closing));
    try {
      wsHub.sendToUser('hub-user-3', frame);
      expect(closing.send).not.toHaveBeenCalled();
    } finally {
      wsHub.remove('hub-user-3', asWs(closing));
    }
  });
});

describe('wsHub presence bookkeeping', () => {
  it('is online until the last socket is removed, never reports offline twice, and leaks no entry', () => {
    const one = asWs(fakeSocket());
    const two = asWs(fakeSocket());
    expect(wsHub.add('hub-user-4', one)).toBe(true);
    expect(wsHub.add('hub-user-4', two)).toBe(false);

    expect(wsHub.remove('hub-user-4', one)).toBe(false);
    expect(wsHub.isOnline('hub-user-4')).toBe(true);

    expect(wsHub.remove('hub-user-4', two)).toBe(true);
    expect(wsHub.isOnline('hub-user-4')).toBe(false);

    // A late duplicate close event must not resurrect or corrupt state.
    expect(wsHub.remove('hub-user-4', two)).toBe(true);
    expect(wsHub.isOnline('hub-user-4')).toBe(false);
  });
});

describe('production password reset', () => {
  it('neither returns nor logs the raw reset token when NODE_ENV=production', async () => {
    await resetDb();
    const app = buildTestApp();
    await registerUser(app, { email: 'prod-reset@example.com' });
    const original = env.NODE_ENV;
    // Capture everything written to the console; the LogMailer may log a safe
    // "no provider configured" line (address only), but a 64-hex reset token
    // must never appear anywhere.
    const output: string[] = [];
    const capture = (...args: unknown[]) => void output.push(args.map(String).join(' '));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(capture);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(capture);
    try {
      (env as { NODE_ENV: string }).NODE_ENV = 'production';
      const result = await authService.requestPasswordReset('prod-reset@example.com');
      expect(result).toBeUndefined();

      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'prod-reset@example.com' });
      expect(res.status).toBe(202);
      expect(res.body).toEqual({});

      expect(output.join('\n')).not.toMatch(/[a-f0-9]{64}/);
      // The token still exists, but only as a hash.
      expect(await prisma.passwordResetToken.count()).toBeGreaterThan(0);
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = original;
      logSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });
});

// ---- Integration over a real HTTP + WebSocket server --------------------------------------

let server: Server;
let wsUrl: string;
let app: ReturnType<typeof buildTestApp>;

beforeAll(async () => {
  app = buildTestApp();
  server = app.listen(0);
  createWsServer(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await resetDb();
});

type Frame = { type: string; payload: Record<string, unknown> };

function waitForFrame(socket: WebSocket, predicate: (f: Frame) => boolean, timeoutMs = 2000): Promise<Frame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for frame'));
    }, timeoutMs);
    function onMessage(data: RawData): void {
      const f = JSON.parse(data.toString()) as Frame;
      if (predicate(f)) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(f);
      }
    }
    socket.on('message', onMessage);
  });
}

async function authed(token: string): Promise<WebSocket> {
  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolve) => socket.once('open', () => resolve()));
  const ready = waitForFrame(socket, (f) => f.type === 'ready');
  socket.send(JSON.stringify({ type: 'auth', payload: { token } }));
  await ready;
  return socket;
}

function closed(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.once('close', () => resolve()));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function pair(): Promise<{
  a: Awaited<ReturnType<typeof registerUser>>;
  b: Awaited<ReturnType<typeof registerUser>>;
  conversationId: string;
}> {
  const a = await registerUser(app);
  const b = await registerUser(app);
  const conv = await request(app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${a.accessToken}`)
    .send({ participantId: b.user.id });
  return { a, b, conversationId: conv.body.id as string };
}

describe('message delivery when a recipient socket fails', () => {
  it('persists the message, returns 201, and a retry with the same clientId does not duplicate', async () => {
    const { a, b, conversationId } = await pair();
    const broken = fakeSocket(() => {
      throw new Error('send after close');
    });
    wsHub.add(b.user.id, asWs(broken));
    const socketA = await authed(a.accessToken);
    try {
      const delivered = waitForFrame(socketA, (f) => f.type === 'message:new');
      const send = () =>
        request(app)
          .post(`/api/conversations/${conversationId}/messages`)
          .set('Authorization', `Bearer ${a.accessToken}`)
          .send({ clientId: 'client-ws-fail-1', body: 'hello' });

      const first = await send();
      expect(first.status).toBe(201);
      await delivered; // the sender's own healthy socket still got the event
      expect(broken.terminate).toHaveBeenCalled();

      const retry = await send();
      expect(retry.status).toBe(200);
      expect(retry.body.id).toBe(first.body.id);
      expect(await prisma.message.count({ where: { conversationId } })).toBe(1);

      // Recipient (offline from the app's point of view) still gets it from the database.
      const history = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${b.accessToken}`);
      expect(history.status).toBe(200);
      expect(history.body.messages).toHaveLength(1);
    } finally {
      wsHub.remove(b.user.id, asWs(broken));
      socketA.close();
    }
  });
});

describe('presence with multiple sockets', () => {
  it('stays online until the last socket closes and broadcasts offline exactly once', async () => {
    const { a, b } = await pair();
    const socketB = await authed(b.accessToken);
    const frames: Frame[] = [];
    socketB.on('message', (d: RawData) => frames.push(JSON.parse(d.toString()) as Frame));

    const s1 = await authed(a.accessToken);
    const s2 = await authed(a.accessToken);
    await sleep(100);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).isOnline).toBe(true);

    s1.close();
    await closed(s1);
    await sleep(150);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).isOnline).toBe(true);

    s2.close();
    await closed(s2);
    await sleep(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).isOnline).toBe(false);

    const presenceOfA = frames.filter((f) => f.type === 'presence' && f.payload.userId === a.user.id);
    expect(presenceOfA.filter((f) => f.payload.isOnline === true)).toHaveLength(1);
    expect(presenceOfA.filter((f) => f.payload.isOnline === false)).toHaveLength(1);
    socketB.close();
  });

  it('ends online after a fast disconnect + reconnect (no stale offline write)', async () => {
    const { a } = await pair();
    for (let i = 0; i < 5; i += 1) {
      const old = await authed(a.accessToken);
      old.close();
      const fresh = await authed(a.accessToken); // reconnect without waiting for the old close to settle
      await sleep(150);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).isOnline).toBe(true);
      fresh.close();
      await closed(fresh);
      await sleep(150);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).isOnline).toBe(false);
    }
  });
});

describe('websocket auth edge cases', () => {
  it('closes with 4401 and TOKEN_EXPIRED for an expired token', async () => {
    const { a } = await pair();
    const expired = jwt.sign({ sub: a.user.id }, env.JWT_ACCESS_SECRET, { expiresIn: -10 });
    const socket = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => socket.once('open', () => resolve()));
    const error = waitForFrame(socket, (f) => f.type === 'error');
    const code = new Promise<number>((resolve) => socket.once('close', (c: number) => resolve(c)));
    socket.send(JSON.stringify({ type: 'auth', payload: { token: expired } }));
    expect((await error).payload.code).toBe('TOKEN_EXPIRED');
    expect(await code).toBe(4401);
  });

  it('treats a second auth frame on an authenticated socket as a no-op and does not register it twice', async () => {
    const { a } = await pair();
    const socket = await authed(a.accessToken);
    socket.send(JSON.stringify({ type: 'auth', payload: { token: a.accessToken } }));
    await sleep(100);
    socket.close();
    await closed(socket);
    await sleep(200);
    expect(wsHub.isOnline(a.user.id)).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).isOnline).toBe(false);
  });
});

function closeCode(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (code: number) => resolve(code)));
}

describe('websocket lifetime is bound to its credentials (F-05)', () => {
  it('closes with 4401 when the access token it authenticated with expires', async () => {
    const { a } = await pair();
    const shortLived = jwt.sign({ sub: a.user.id }, env.JWT_ACCESS_SECRET, { expiresIn: 1 });
    const socket = await authed(shortLived);
    expect(await closeCode(socket)).toBe(4401);
  });

  it('closes every socket of the user with 4401 on logout', async () => {
    const { a, b } = await pair();
    const s1 = await authed(a.accessToken);
    const s2 = await authed(a.accessToken);
    const other = await authed(b.accessToken);
    const codes = Promise.all([closeCode(s1), closeCode(s2)]);

    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${a.accessToken}`);
    expect(res.status).toBe(204);

    expect(await codes).toEqual([4401, 4401]);
    expect(other.readyState).toBe(WebSocket.OPEN); // other users are untouched
    other.close();
  });

  it('closes the user sockets with 4401 after a password reset', async () => {
    const { a } = await pair();
    const socket = await authed(a.accessToken);
    const code = closeCode(socket);
    const reset = await authService.requestPasswordReset(a.user.email);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: reset?.resetToken, newPassword: 'a-brand-new-password' });
    expect(res.status).toBe(204);
    expect(await code).toBe(4401);
  });

  it('does not close the socket on a normal token refresh', async () => {
    const { a } = await pair();
    const socket = await authed(a.accessToken);
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken });
    expect(res.status).toBe(200);
    await sleep(300);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it('closeUser tolerates a socket whose close() throws and still closes the others', () => {
    const broken = fakeSocket();
    (broken as unknown as { close: () => void }).close = () => {
      throw new Error('already gone');
    };
    const healthy = fakeSocket();
    const close = vi.fn();
    (healthy as unknown as { close: typeof close }).close = close;
    wsHub.add('hub-user-5', asWs(broken));
    wsHub.add('hub-user-5', asWs(healthy));
    try {
      expect(() => wsHub.closeUser('hub-user-5', 4401, 'x')).not.toThrow();
      expect(close).toHaveBeenCalledWith(4401, 'x');
      expect(broken.terminate).toHaveBeenCalledTimes(1);
    } finally {
      wsHub.remove('hub-user-5', asWs(broken));
      wsHub.remove('hub-user-5', asWs(healthy));
    }
  });
});
