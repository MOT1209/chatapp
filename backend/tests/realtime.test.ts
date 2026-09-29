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

describe('WebSocket frame validation', () => {
  it('rejects the auth frame itself when the token field is the wrong type', async () => {
    const socket = connect();
    await opened(socket);
    // A number instead of a string. Before Zod validation this reached
    // jwt.verify() directly; now it never gets past the frame schema, so it's
    // treated as an invalid frame rather than a failed auth attempt.
    const errorFrame = waitForFrame(socket, (f) => f.type === 'error');
    socket.send(JSON.stringify({ type: 'auth', payload: { token: 12345 } }));
    const frame = await errorFrame;
    expect(frame.payload.code).toBe('VALIDATION_ERROR');
    socket.close();
  });

  it('rejects malformed JSON without crashing the connection or the server', async () => {
    const a = await registerUser(app, { username: 'malformedA' });
    const socket = await authed(a.accessToken);

    const errorFrame = waitForFrame(socket, (f) => f.type === 'error');
    socket.send('this is not { json');
    const frame = await errorFrame;
    expect(frame.payload.code).toBe('VALIDATION_ERROR');

    // The connection itself survived: ping still works right after.
    const pong = waitForFrame(socket, (f) => f.type === 'pong');
    socket.send(JSON.stringify({ type: 'ping', payload: {} }));
    await pong;

    socket.close();
  });

  it('rejects an unknown frame type', async () => {
    const a = await registerUser(app, { username: 'unknownTypeA' });
    const socket = await authed(a.accessToken);

    const errorFrame = waitForFrame(socket, (f) => f.type === 'error');
    socket.send(JSON.stringify({ type: 'delete-everything', payload: {} }));
    const frame = await errorFrame;
    expect(frame.payload.code).toBe('VALIDATION_ERROR');

    socket.close();
  });

  it('rejects a typing frame missing required fields', async () => {
    const a = await registerUser(app, { username: 'missingFieldsA' });
    const socket = await authed(a.accessToken);

    const errorFrame = waitForFrame(socket, (f) => f.type === 'error');
    socket.send(JSON.stringify({ type: 'typing', payload: {} }));
    const frame = await errorFrame;
    expect(frame.payload.code).toBe('VALIDATION_ERROR');

    socket.close();
  });

  it('rejects a typing frame with the wrong field types', async () => {
    const a = await registerUser(app, { username: 'wrongTypesA' });
    const socket = await authed(a.accessToken);

    const errorFrame = waitForFrame(socket, (f) => f.type === 'error');
    socket.send(JSON.stringify({ type: 'typing', payload: { conversationId: 123, isTyping: 'yes' } }));
    const frame = await errorFrame;
    expect(frame.payload.code).toBe('VALIDATION_ERROR');

    socket.close();
  });

  it('rejects a read frame missing messageId', async () => {
    const a = await registerUser(app, { username: 'missingMsgIdA' });
    const socket = await authed(a.accessToken);

    const errorFrame = waitForFrame(socket, (f) => f.type === 'error');
    socket.send(JSON.stringify({ type: 'read', payload: { conversationId: 'c_1' } }));
    const frame = await errorFrame;
    expect(frame.payload.code).toBe('VALIDATION_ERROR');

    socket.close();
  });

  it('rejects a ping frame carrying an unexpected payload field', async () => {
    const a = await registerUser(app, { username: 'pingExtraA' });
    const socket = await authed(a.accessToken);

    const errorFrame = waitForFrame(socket, (f) => f.type === 'error');
    socket.send(JSON.stringify({ type: 'ping', payload: { unexpected: true } }));
    const frame = await errorFrame;
    expect(frame.payload.code).toBe('VALIDATION_ERROR');

    socket.close();
  });

  it('closes an oversized frame instead of crashing, and the server keeps serving other clients', async () => {
    const a = await registerUser(app, { username: 'oversizedA' });
    const b = await registerUser(app, { username: 'oversizedB' });

    const socketA = await authed(a.accessToken);
    const closed = new Promise<number>((resolve) => socketA.once('close', (code) => resolve(code)));

    // Comfortably over the server's 16KB maxPayload.
    const oversizedConversationId = 'x'.repeat(64 * 1024);
    socketA.send(JSON.stringify({ type: 'typing', payload: { conversationId: oversizedConversationId, isTyping: true } }));
    await closed;

    // Proof the server process itself is still healthy, not just that one
    // socket closed: a brand-new client can still connect and authenticate.
    const socketB = await authed(b.accessToken);
    socketB.close();
  });
});

describe('WebSocket authorization', () => {
  it('drops a typing frame for a conversation the sender is not a member of', async () => {
    const a = await registerUser(app, { username: 'authzA' });
    const b = await registerUser(app, { username: 'authzB' });
    const outsider = await registerUser(app, { username: 'authzOutsider' });
    const conv = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });
    const conversationId = conv.body.id as string;

    const socketB = await authed(b.accessToken);
    const socketOutsider = await authed(outsider.accessToken);

    let leakedToB = false;
    socketB.on('message', (data: Buffer) => {
      const frame = JSON.parse(data.toString()) as Frame;
      if (frame.type === 'typing') {
        leakedToB = true;
      }
    });

    socketOutsider.send(JSON.stringify({ type: 'typing', payload: { conversationId, isTyping: true } }));
    // Prove the outsider's socket is still alive after being ignored — the
    // rejection is silent, not a disconnect.
    const pong = waitForFrame(socketOutsider, (f) => f.type === 'pong');
    socketOutsider.send(JSON.stringify({ type: 'ping', payload: {} }));
    await pong;

    expect(leakedToB).toBe(false);

    socketB.close();
    socketOutsider.close();
  });

  it('does not mark a message read when the sender is not a conversation member', async () => {
    const a = await registerUser(app, { username: 'authzReadA' });
    const b = await registerUser(app, { username: 'authzReadB' });
    const outsider = await registerUser(app, { username: 'authzReadOutsider' });
    const conv = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });
    const conversationId = conv.body.id as string;

    const sent = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'authz-read-1', body: 'hello' });

    const socketOutsider = await authed(outsider.accessToken);
    socketOutsider.send(
      JSON.stringify({ type: 'read', payload: { conversationId, messageId: sent.body.id as string } }),
    );

    // Give the (rejected) read a moment, then confirm via REST that the
    // message is still unread from B's side — the outsider's frame had no effect.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const list = await request(app).get('/api/conversations').set('Authorization', `Bearer ${b.accessToken}`);
    expect(list.body.conversations[0].unreadCount).toBe(1);
    expect(list.body.conversations[0].lastMessage.status).toBe('sent');

    socketOutsider.close();
  });
});

describe('WebSocket abuse protection', () => {
  let limitedServer: Server;
  let limitedUrl: string;

  beforeAll(async () => {
    limitedServer = app.listen(0);
    createWsServer(limitedServer, { frameLimit: 3, frameWindowMs: 60_000, heartbeatMs: 100 });
    await new Promise<void>((resolve) => limitedServer.once('listening', resolve));
    limitedUrl = `ws://127.0.0.1:${(limitedServer.address() as AddressInfo).port}/ws`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => limitedServer.close(() => resolve()));
  });

  async function authedOn(url: string, token: string, autoPong = true): Promise<WebSocket> {
    const socket = new WebSocket(url, { autoPong });
    await opened(socket);
    const ready = waitForFrame(socket, (f) => f.type === 'ready');
    socket.send(JSON.stringify({ type: 'auth', payload: { token } }));
    await ready;
    return socket;
  }

  it('drops typing frames over the per-socket budget without closing the socket', async () => {
    const a = await registerUser(app, { username: 'floodA' });
    const b = await registerUser(app, { username: 'floodB' });
    const conv = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });
    const conversationId = conv.body.id as string;

    const socketA = await authedOn(limitedUrl, a.accessToken);
    const socketB = await authedOn(limitedUrl, b.accessToken);

    let received = 0;
    socketB.on('message', (raw: RawData) => {
      if ((JSON.parse(raw.toString()) as Frame).type === 'typing') {
        received += 1;
      }
    });
    for (let i = 0; i < 10; i += 1) {
      socketA.send(JSON.stringify({ type: 'typing', payload: { conversationId, isTyping: true } }));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(received).toBe(3);
    expect(socketA.readyState).toBe(WebSocket.OPEN);

    socketA.close();
    socketB.close();
  });

  it('terminates a socket that stops answering protocol pings', async () => {
    const a = await registerUser(app, { username: 'deadsock' });
    const socket = await authedOn(limitedUrl, a.accessToken, false);
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    await Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('socket was not terminated')), 2000)),
    ]);
  });
});
