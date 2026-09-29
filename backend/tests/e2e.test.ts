import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, type RawData } from 'ws';
import request from 'supertest';
import { createWsServer } from '../src/realtime/ws-server.js';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';

/**
 * The one test that matters most for Alpha v0.0.1: the full two-person
 * journey from the task brief, §29 and §36, chained end to end against a
 * real HTTP + WebSocket server and a real Postgres database — no mocks on
 * the backend side. Every individual piece here (register, search, create
 * conversation, send, read, typing, presence) already has its own focused
 * tests elsewhere (auth.test.ts, users.test.ts, conversations.test.ts,
 * messages.test.ts, realtime.test.ts); this file exists because none of
 * those prove the *whole story* happens correctly for two independent users
 * in one continuous flow, which is what the release actually depends on.
 *
 * What this cannot prove: that the Flutter client itself does the right
 * thing with these responses and frames, or that two real people on two
 * real devices (e.g. Web + Android, per §36) get the same result. That
 * needs the Flutter app run on real platforms, which this environment
 * cannot do (no Flutter SDK here) — see the PR/report for that caveat.
 */

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

describe('End-to-end: two independent users, the full Alpha journey', () => {
  it('register → search → create conversation → send/receive → typing → read → presence, both directions', async () => {
    // 1. Two people register independently — this is the only "mock-free"
    // requirement worth stating explicitly: no seeded users, no fixtures,
    // just two fresh accounts created the same way a real signup would.
    const ahmad = await registerUser(app, {
      username: 'ahmad_e2e',
      displayName: 'Ahmad',
      email: 'ahmad_e2e@example.com',
      password: 'correct-horse-battery',
    });
    const sara = await registerUser(app, {
      username: 'sara_e2e',
      displayName: 'Sara',
      email: 'sara_e2e@example.com',
      password: 'correct-horse-battery',
    });

    // 2. Ahmad finds Sara by search — the same endpoint the "find each
    // other" step in the task brief describes.
    const searchRes = await request(app)
      .get('/api/users/search')
      .query({ q: 'sara' })
      .set('Authorization', `Bearer ${ahmad.accessToken}`);
    expect(searchRes.status).toBe(200);
    const found = searchRes.body.users.find((u: { id: string }) => u.id === sara.user.id);
    expect(found).toBeDefined();
    expect(found.username).toBe('sara_e2e');

    // 3. Both connect over WebSocket and authenticate before anything else
    // happens — mirrors the real client lifecycle (connect once, stay
    // connected through the whole session).
    const socketAhmad = await authed(ahmad.accessToken);
    const socketSara = await authed(sara.accessToken);

    // 4. Presence: the moment Sara's socket authenticates, Ahmad — who does
    // not share a conversation with her yet — must NOT see her presence.
    // Presence is scoped to actual contacts, not broadcast globally.
    let presenceLeakedBeforeConversation = false;
    const presenceWatcher = (data: RawData): void => {
      const frame = JSON.parse(data.toString()) as Frame;
      if (frame.type === 'presence' && frame.payload.userId === sara.user.id) {
        presenceLeakedBeforeConversation = true;
      }
    };
    socketAhmad.on('message', presenceWatcher);
    await new Promise((resolve) => setTimeout(resolve, 150));
    socketAhmad.off('message', presenceWatcher);
    expect(presenceLeakedBeforeConversation).toBe(false);

    // 5. Ahmad starts a direct conversation with Sara. Idempotent creation
    // is covered elsewhere (conversations.test.ts); here it's just step one
    // of the real flow.
    const createRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${ahmad.accessToken}`)
      .send({ participantId: sara.user.id });
    expect(createRes.status).toBe(200);
    const conversationId = createRes.body.id as string;
    expect(createRes.body.participant.id).toBe(sara.user.id);

    // 6. Now that a conversation exists, presence between the two of them
    // is live: disconnecting and reconnecting Sara's socket should notify
    // Ahmad, proving the contact-scoping above isn't just "never works".
    socketSara.close();
    const offlinePromise = waitForFrame(
      socketAhmad,
      (f) => f.type === 'presence' && f.payload.userId === sara.user.id && f.payload.isOnline === false,
    );
    const offlineFrame = await offlinePromise;
    expect(offlineFrame.payload.isOnline).toBe(false);

    const onlinePromise = waitForFrame(
      socketAhmad,
      (f) => f.type === 'presence' && f.payload.userId === sara.user.id && f.payload.isOnline === true,
    );
    const socketSaraReconnected = await authed(sara.accessToken);
    await onlinePromise;

    // 7. Typing: Ahmad starts composing. Sara's socket must see it live.
    const typingPromise = waitForFrame(socketSaraReconnected, (f) => f.type === 'typing');
    socketAhmad.send(JSON.stringify({ type: 'typing', payload: { conversationId, isTyping: true } }));
    const typingFrame = await typingPromise;
    expect(typingFrame.payload).toEqual({ conversationId, userId: ahmad.user.id, isTyping: true });

    // 8. Ahmad sends the message over REST (the send path, not the socket —
    // matches the real client: REST is authoritative, the socket is the
    // notification channel). Sara must receive it live, with no reload.
    const deliveredToSara = waitForFrame(socketSaraReconnected, (f) => f.type === 'message:new');
    const sendRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${ahmad.accessToken}`)
      .send({ clientId: 'e2e-msg-1', body: 'Hello Sara, this is Ahmad!' });
    expect(sendRes.status).toBe(201);

    const saraFrame = await deliveredToSara;
    const deliveredMessage = saraFrame.payload.message as { id: string; body: string; sender: { id: string } };
    expect(deliveredMessage.body).toBe('Hello Sara, this is Ahmad!');
    expect(deliveredMessage.sender.id).toBe(ahmad.user.id);
    expect(deliveredMessage.id).toBe(sendRes.body.id);

    // 9. If Sara had been offline, the message would simply wait in the
    // database — proven separately by fetching history over REST, exactly
    // as a client would after opening the conversation from cold.
    const historyForSara = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${sara.accessToken}`);
    expect(historyForSara.body.messages).toHaveLength(1);
    expect(historyForSara.body.messages[0].id).toBe(sendRes.body.id);

    // 10. Sara reads it. Ahmad must be notified live that it was read.
    const readNotifiesAhmad = waitForFrame(socketAhmad, (f) => f.type === 'read');
    socketSaraReconnected.send(
      JSON.stringify({ type: 'read', payload: { conversationId, messageId: sendRes.body.id as string } }),
    );
    const readFrame = await readNotifiesAhmad;
    expect(readFrame.payload.messageId).toBe(sendRes.body.id);
    expect(readFrame.payload.userId).toBe(sara.user.id);

    // 11. Sara replies. Ahmad must receive it live — proving the round trip
    // works in both directions, not just the direction that happened to be
    // tested first.
    const deliveredToAhmad = waitForFrame(socketAhmad, (f) => f.type === 'message:new');
    const replyRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${sara.accessToken}`)
      .send({ clientId: 'e2e-msg-2', body: 'Hi Ahmad! Good to hear from you.' });
    expect(replyRes.status).toBe(201);

    const ahmadFrame = await deliveredToAhmad;
    const replyMessage = ahmadFrame.payload.message as { body: string; sender: { id: string } };
    expect(replyMessage.body).toBe('Hi Ahmad! Good to hear from you.');
    expect(replyMessage.sender.id).toBe(sara.user.id);

    // 12. Final state check from each side's own point of view — the same
    // call each app makes when it opens its conversation list on next launch.
    const ahmadList = await request(app).get('/api/conversations').set('Authorization', `Bearer ${ahmad.accessToken}`);
    expect(ahmadList.body.conversations[0].lastMessage.body).toBe('Hi Ahmad! Good to hear from you.');
    expect(ahmadList.body.conversations[0].unreadCount).toBe(1); // Ahmad hasn't read Sara's reply yet.

    const saraList = await request(app).get('/api/conversations').set('Authorization', `Bearer ${sara.accessToken}`);
    expect(saraList.body.conversations[0].lastMessage.body).toBe('Hi Ahmad! Good to hear from you.');
    expect(saraList.body.conversations[0].unreadCount).toBe(0); // Sara sent it and already read Ahmad's.

    socketAhmad.close();
    socketSaraReconnected.close();
  });
});
