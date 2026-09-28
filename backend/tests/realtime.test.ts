import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, type RawData } from 'ws';
import request from 'supertest';
import { createWsServer } from '../src/realtime/ws-server.js';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';

let server: Server;
let wsUrl: string;
let app: ReturnType<typeof buildTestApp>;

beforeAll(async () => {
  app = buildTestApp();
  server = app.listen(0);
  createWsServer(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  wsUrl = `ws://127.0.0.1:${port}/ws`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(async () => {
  // Server-side disconnect cleanup (presence update, DB write) runs asynchronously
  // after the client socket's 'close' event fires. Give it a moment to settle
  // before wiping the tables a still-in-flight query might reference.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await resetDb();
});

type Frame = { type: string; payload: Record<string, unknown> };

function connect(): WebSocket {
  return new WebSocket(wsUrl);
}

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.once('open', () => resolve()));
}

function waitForFrame(socket: WebSocket, predicate: (frame: Frame) => boolean, timeoutMs = 2000): Promise<Frame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for frame'));
    }, timeoutMs);

    function onMessage(data: RawData): void {
      const frame = JSON.parse(data.toString()) as Frame;
      if (predicate(frame)) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(frame);
      }
    }
    socket.on('message', onMessage);
  });
}

async function authed(token: string): Promise<WebSocket> {
  const socket = connect();
  await opened(socket);
  const ready = waitForFrame(socket, (f) => f.type === 'ready');
  socket.send(JSON.stringify({ type: 'auth', payload: { token } }));
  await ready;
  return socket;
}

describe('WebSocket auth handshake', () => {
  it('sends ready after a valid auth frame', async () => {
    const a = await registerUser(app, { username: 'wsauth' });
    const socket = await authed(a.accessToken);
    socket.close();
  });

  it('closes with 4401 for an invalid token', async () => {
    const socket = connect();
    await opened(socket);
    const closed = new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));
    socket.send(JSON.stringify({ type: 'auth', payload: { token: 'garbage' } }));
    expect(await closed).toBe(4401);
  });
});

describe('WebSocket message delivery', () => {
  it('pushes message:new to the recipient in real time', async () => {
    const a = await registerUser(app, { username: 'rtA' });
    const b = await registerUser(app, { username: 'rtB' });
    const conv = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });
    const conversationId = conv.body.id as string;

    const socketB = await authed(b.accessToken);
    const delivered = waitForFrame(socketB, (f) => f.type === 'message:new');

    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'rt-1', body: 'hello via ws' });

    const frame = await delivered;
    const message = frame.payload.message as { body: string; sender: { id: string } };
    expect(message.body).toBe('hello via ws');
    expect(message.sender.id).toBe(a.user.id);

    socketB.close();
  });
});

describe('WebSocket typing', () => {
  it('relays typing only to the other participant', async () => {
    const a = await registerUser(app, { username: 'typeA' });
    const b = await registerUser(app, { username: 'typeB' });
    const conv = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });
    const conversationId = conv.body.id as string;

    const socketA = await authed(a.accessToken);
    const socketB = await authed(b.accessToken);

    const typing = waitForFrame(socketB, (f) => f.type === 'typing');
    socketA.send(JSON.stringify({ type: 'typing', payload: { conversationId, isTyping: true } }));
    const frame = await typing;

    expect(frame.payload).toEqual({ conversationId, userId: a.user.id, isTyping: true });

    socketA.close();
    socketB.close();
  });
});

describe('WebSocket presence', () => {
  it('broadcasts online/offline to conversation partners', async () => {
    const a = await registerUser(app, { username: 'presA' });
    const b = await registerUser(app, { username: 'presB' });
    await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });

    const socketB = await authed(b.accessToken);

    const online = waitForFrame(socketB, (f) => f.type === 'presence' && f.payload.userId === a.user.id);
    const socketA = await authed(a.accessToken);
    const onlineFrame = await online;
    expect(onlineFrame.payload.isOnline).toBe(true);

    const offline = waitForFrame(
      socketB,
      (f) => f.type === 'presence' && f.payload.userId === a.user.id && f.payload.isOnline === false,
    );
    socketA.close();
    const offlineFrame = await offline;
    expect(offlineFrame.payload.isOnline).toBe(false);
    expect(typeof offlineFrame.payload.lastSeenAt).toBe('string');

    socketB.close();
  });
});

describe('WebSocket read frame', () => {
  it('produces the same effect as the REST read endpoint', async () => {
    const a = await registerUser(app, { username: 'wsReadA' });
    const b = await registerUser(app, { username: 'wsReadB' });
    const conv = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });
    const conversationId = conv.body.id as string;

    const sent = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'wsread-1', body: 'read me' });

    const socketA = await authed(a.accessToken);
    const socketB = await authed(b.accessToken);

    const readFrame = waitForFrame(socketA, (f) => f.type === 'read');
    socketB.send(
      JSON.stringify({ type: 'read', payload: { conversationId, messageId: sent.body.id as string } }),
    );
    const frame = await readFrame;
    expect(frame.payload.messageId).toBe(sent.body.id);
    expect(frame.payload.userId).toBe(b.user.id);

    socketA.close();
    socketB.close();
  });
});

describe('WebSocket heartbeat', () => {
  it('responds to ping with pong', async () => {
    const a = await registerUser(app, { username: 'pingA' });
    const socket = await authed(a.accessToken);

    const pong = waitForFrame(socket, (f) => f.type === 'pong');
    socket.send(JSON.stringify({ type: 'ping', payload: {} }));
    await pong;

    socket.close();
  });
});
