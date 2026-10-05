import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, type RawData } from 'ws';
import type { WebSocket as WsSocket } from 'ws';
import { env } from '../src/config/env.js';
import { MAX_BUFFERED_BYTES, wsHub } from '../src/realtime/ws-hub.js';
import { createWsServer } from '../src/realtime/ws-server.js';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';

// Abuse limits on the realtime layer: per-account connection cap, per-socket frame
// flood budget, and the slow-consumer backlog ceiling.

type Frame = { type: string; payload: Record<string, unknown> };

let app: ReturnType<typeof buildTestApp>;
const servers: Server[] = [];
const sockets: WebSocket[] = [];

async function startServer(options: Parameters<typeof createWsServer>[1]): Promise<string> {
  const server = app.listen(0);
  servers.push(server);
  createWsServer(server, options);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
}

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    sockets.push(socket);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

/** Resolves with how the handshake ended: `ready`, or the close code the server used. */
function authenticate(socket: WebSocket, token: string): Promise<{ outcome: 'ready' } | { outcome: 'closed'; code: number; errorCode?: string }> {
  return new Promise((resolve) => {
    let errorCode: string | undefined;
    socket.on('message', (raw: RawData) => {
      const frame = JSON.parse(raw.toString()) as Frame;
      if (frame.type === 'ready') resolve({ outcome: 'ready' });
      if (frame.type === 'error') errorCode = frame.payload.code as string;
    });
    socket.once('close', (code) => resolve({ outcome: 'closed', code, errorCode }));
    socket.send(JSON.stringify({ type: 'auth', payload: { token } }));
  });
}

function closeCode(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)));
}

beforeAll(() => {
  app = buildTestApp();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  // Presence cleanup is asynchronous; let it settle before wiping the tables.
  await new Promise((resolve) => setTimeout(resolve, 80));
  await resetDb();
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

describe('per-account connection cap', () => {
  it('defaults to a sane, configurable ceiling', () => {
    expect(env.WS_MAX_CONNECTIONS_PER_USER).toBeGreaterThanOrEqual(2);
  });

  it('refuses the socket over the limit with 4429 and leaves existing sockets untouched', async () => {
    const url = await startServer({ maxConnectionsPerUser: 2 });
    const user = await registerUser(app, { username: 'capA' });

    const first = await open(url);
    const second = await open(url);
    expect(await authenticate(first, user.accessToken)).toEqual({ outcome: 'ready' });
    expect(await authenticate(second, user.accessToken)).toEqual({ outcome: 'ready' });

    const third = await open(url);
    const result = await authenticate(third, user.accessToken);
    expect(result).toEqual({ outcome: 'closed', code: 4429, errorCode: 'RATE_LIMITED' });

    expect(first.readyState).toBe(WebSocket.OPEN);
    expect(second.readyState).toBe(WebSocket.OPEN);
    expect(wsHub.count(user.user.id)).toBe(2);
  });

  it('frees a slot when a socket closes', async () => {
    const url = await startServer({ maxConnectionsPerUser: 1 });
    const user = await registerUser(app, { username: 'capB' });

    const first = await open(url);
    expect((await authenticate(first, user.accessToken)).outcome).toBe('ready');
    const closed = closeCode(first);
    first.close();
    await closed;
    await new Promise((resolve) => setTimeout(resolve, 80));

    const second = await open(url);
    expect(await authenticate(second, user.accessToken)).toEqual({ outcome: 'ready' });
  });

  it('cannot be overshot by simultaneous authentications', async () => {
    const url = await startServer({ maxConnectionsPerUser: 3 });
    const user = await registerUser(app, { username: 'capC' });

    const opened = await Promise.all(Array.from({ length: 10 }, () => open(url)));
    const results = await Promise.all(opened.map((s) => authenticate(s, user.accessToken)));

    expect(results.filter((r) => r.outcome === 'ready')).toHaveLength(3);
    expect(results.filter((r) => r.outcome === 'closed' && r.code === 4429)).toHaveLength(7);
    expect(wsHub.count(user.user.id)).toBe(3);
  });

  it('counts per account: one user at the limit does not block another', async () => {
    const url = await startServer({ maxConnectionsPerUser: 1 });
    const a = await registerUser(app, { username: 'capD1' });
    const b = await registerUser(app, { username: 'capD2' });

    expect((await authenticate(await open(url), a.accessToken)).outcome).toBe('ready');
    expect((await authenticate(await open(url), b.accessToken)).outcome).toBe('ready');
  });
});

describe('per-socket frame flood budget', () => {
  it('closes with 4429 once every kind of frame, valid or not, exceeds the budget', async () => {
    const url = await startServer({ floodLimit: 6, frameWindowMs: 60_000 });
    const user = await registerUser(app, { username: 'floodX' });
    const socket = await open(url);
    expect(await authenticate(socket, user.accessToken)).toEqual({ outcome: 'ready' });

    const closed = closeCode(socket);
    // The auth frame was #1. Mix valid pings with garbage: all of it counts.
    for (let i = 0; i < 4; i += 1) socket.send(JSON.stringify({ type: 'ping', payload: {} }));
    socket.send('not json at all');
    socket.send(JSON.stringify({ type: 'nonsense' }));
    socket.send(JSON.stringify({ type: 'ping', payload: {} }));
    expect(await closed).toBe(4429);
  });

  it('does not close a well-behaved client', async () => {
    const url = await startServer({ floodLimit: 6, frameWindowMs: 60_000 });
    const user = await registerUser(app, { username: 'floodY' });
    const socket = await open(url);
    expect(await authenticate(socket, user.accessToken)).toEqual({ outcome: 'ready' });

    for (let i = 0; i < 4; i += 1) socket.send(JSON.stringify({ type: 'ping', payload: {} }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('starts a fresh budget when the window rolls over', async () => {
    const url = await startServer({ floodLimit: 4, frameWindowMs: 150 });
    const user = await registerUser(app, { username: 'floodZ' });
    const socket = await open(url);
    expect(await authenticate(socket, user.accessToken)).toEqual({ outcome: 'ready' });

    for (let round = 0; round < 3; round += 1) {
      for (let i = 0; i < 3; i += 1) socket.send(JSON.stringify({ type: 'ping', payload: {} }));
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });
});

describe('slow-consumer protection', () => {
  type FakeSocket = {
    OPEN: number;
    readyState: number;
    bufferedAmount: number;
    send: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  };
  const fake = (bufferedAmount: number): FakeSocket => ({
    OPEN: 1,
    readyState: 1,
    bufferedAmount,
    send: vi.fn(),
    terminate: vi.fn(),
  });
  const asWs = (s: FakeSocket): WsSocket => s as unknown as WsSocket;

  it('drops a socket whose backlog exceeds the ceiling and keeps serving the rest', () => {
    const stalled = fake(MAX_BUFFERED_BYTES + 1);
    const healthy = fake(0);
    wsHub.add('slow-user', asWs(stalled));
    wsHub.add('slow-user', asWs(healthy));
    try {
      wsHub.sendToUser('slow-user', { type: 'pong', payload: {} });
      expect(stalled.send).not.toHaveBeenCalled();
      expect(stalled.terminate).toHaveBeenCalledTimes(1);
      expect(healthy.send).toHaveBeenCalledTimes(1);
      expect(healthy.terminate).not.toHaveBeenCalled();
    } finally {
      wsHub.remove('slow-user', asWs(stalled));
      wsHub.remove('slow-user', asWs(healthy));
    }
  });

  it('keeps a socket that is exactly at the ceiling', () => {
    const atLimit = fake(MAX_BUFFERED_BYTES);
    wsHub.add('slow-user-2', asWs(atLimit));
    try {
      wsHub.sendToUser('slow-user-2', { type: 'pong', payload: {} });
      expect(atLimit.send).toHaveBeenCalledTimes(1);
      expect(atLimit.terminate).not.toHaveBeenCalled();
    } finally {
      wsHub.remove('slow-user-2', asWs(atLimit));
    }
  });
});
