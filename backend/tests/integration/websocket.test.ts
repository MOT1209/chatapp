import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { startLiveServer, registerUser, TestSocket, type LiveServer, type RegisteredUser } from '../helpers/harness.js';

let live: LiveServer;
let a: RegisteredUser;
let b: RegisteredUser;
let convId: string;

beforeEach(async () => {
  live = await startLiveServer();
  a = await registerUser(live.app, { username: 'alice', email: 'alice@e.com' });
  b = await registerUser(live.app, { username: 'bob', email: 'bob@e.com' });
  const conv = await request(live.app).post('/api/conversations').set('Authorization', `Bearer ${a.accessToken}`).send({ participantId: b.user.id });
  convId = conv.body.id;
});

afterEach(async () => {
  await live.close();
});

describe('WebSocket auth handshake', () => {
  it('sends ready after a valid auth frame', async () => {
    const sock = await TestSocket.open(live.wsUrl);
    sock.send({ type: 'auth', payload: { token: a.accessToken } });
    const ready = await sock.waitFor('ready');
    expect(ready.payload).toEqual({ userId: a.user.id });
    sock.close();
  });

  it('replies pong to a ping', async () => {
    const sock = await TestSocket.open(live.wsUrl);
    sock.send({ type: 'auth', payload: { token: a.accessToken } });
    await sock.waitFor('ready');
    sock.send({ type: 'ping', payload: {} });
    await sock.waitFor('pong');
    sock.close();
  });

  it('errors and closes with 4401 on an invalid token', async () => {
    const sock = await TestSocket.open(live.wsUrl);
    sock.send({ type: 'auth', payload: { token: 'garbage' } });
    const err = await sock.waitFor('error');
    expect((err.payload as { code: string }).code).toBe('UNAUTHENTICATED');
    expect(await sock.waitForClose()).toBe(4401);
  });

  it('rejects a non-auth frame sent before authenticating', async () => {
    const sock = await TestSocket.open(live.wsUrl);
    sock.send({ type: 'ping', payload: {} });
    const err = await sock.waitFor('error');
    expect((err.payload as { code: string }).code).toBe('UNAUTHENTICATED');
    sock.close();
  });

  it('closes an unauthenticated socket after the grace period', async () => {
    const sock = await TestSocket.open(live.wsUrl);
    expect(await sock.waitForClose(8000)).toBe(4401);
  }, 10000);
});

describe('WebSocket resilience to bad clients', () => {
  it('answers a malformed frame with an error but stays open', async () => {
    const sock = await TestSocket.open(live.wsUrl);
    sock.send({ type: 'auth', payload: { token: a.accessToken } });
    await sock.waitFor('ready');

    sock.sendRaw('this is not json{{{');
    const err = await sock.waitFor('error');
    expect((err.payload as { code: string }).code).toBe('VALIDATION_ERROR');

    // The socket survived: it still answers a ping.
    sock.send({ type: 'ping', payload: {} });
    await sock.waitFor('pong');
    sock.close();
  });

  it('rejects an unknown frame type without dropping the socket', async () => {
    const sock = await TestSocket.open(live.wsUrl);
    sock.send({ type: 'auth', payload: { token: a.accessToken } });
    await sock.waitFor('ready');
    sock.send({ type: 'nonsense', payload: {} });
    const err = await sock.waitFor('error');
    expect((err.payload as { code: string }).code).toBe('VALIDATION_ERROR');
    sock.close();
  });
});

describe('WebSocket realtime delivery', () => {
  it('pushes message:new to the recipient when a message is sent', async () => {
    const bSock = await TestSocket.open(live.wsUrl);
    bSock.send({ type: 'auth', payload: { token: b.accessToken } });
    await bSock.waitFor('ready');

    await request(live.app).post(`/api/conversations/${convId}/messages`).set('Authorization', `Bearer ${a.accessToken}`).send({ clientId: randomUUID(), body: 'over the wire' });

    const frame = await bSock.waitFor('message:new');
    expect((frame.payload as { message: { body: string } }).message.body).toBe('over the wire');
    bSock.close();
  });

  it('relays typing to the other member only', async () => {
    const aSock = await TestSocket.open(live.wsUrl);
    aSock.send({ type: 'auth', payload: { token: a.accessToken } });
    await aSock.waitFor('ready');
    const bSock = await TestSocket.open(live.wsUrl);
    bSock.send({ type: 'auth', payload: { token: b.accessToken } });
    await bSock.waitFor('ready');

    aSock.send({ type: 'typing', payload: { conversationId: convId, isTyping: true } });
    const typing = await bSock.waitFor('typing');
    expect(typing.payload).toMatchObject({ conversationId: convId, userId: a.user.id, isTyping: true });
    aSock.close();
    bSock.close();
  });

  it('relays a read receipt over the socket', async () => {
    const aSock = await TestSocket.open(live.wsUrl);
    aSock.send({ type: 'auth', payload: { token: a.accessToken } });
    await aSock.waitFor('ready');
    const bSock = await TestSocket.open(live.wsUrl);
    bSock.send({ type: 'auth', payload: { token: b.accessToken } });
    await bSock.waitFor('ready');

    const sent = await request(live.app).post(`/api/conversations/${convId}/messages`).set('Authorization', `Bearer ${a.accessToken}`).send({ clientId: randomUUID(), body: 'read me' });
    await bSock.waitFor('message:new');

    bSock.send({ type: 'read', payload: { conversationId: convId, messageId: sent.body.id } });
    const read = await aSock.waitFor('read');
    expect(read.payload).toMatchObject({ conversationId: convId, userId: b.user.id, messageId: sent.body.id });
    aSock.close();
    bSock.close();
  });
});

describe('WebSocket presence', () => {
  it('tells partners when a user comes online and goes offline', async () => {
    // B is online and watching.
    const bSock = await TestSocket.open(live.wsUrl);
    bSock.send({ type: 'auth', payload: { token: b.accessToken } });
    await bSock.waitFor('ready');

    // A connects → B hears A is online.
    const aSock = await TestSocket.open(live.wsUrl);
    aSock.send({ type: 'auth', payload: { token: a.accessToken } });
    await aSock.waitFor('ready');
    const online = await bSock.waitFor('presence');
    expect(online.payload).toMatchObject({ userId: a.user.id, isOnline: true });

    // A disconnects → B hears A is offline.
    aSock.close();
    const offline = await bSock.waitFor('presence');
    expect(offline.payload).toMatchObject({ userId: a.user.id, isOnline: false });
    expect((offline.payload as { lastSeenAt: string }).lastSeenAt).toBeTruthy();
    bSock.close();
  });

  it('stays online until the last socket closes (ref-counted)', async () => {
    const s1 = await TestSocket.open(live.wsUrl);
    s1.send({ type: 'auth', payload: { token: a.accessToken } });
    await s1.waitFor('ready');
    const s2 = await TestSocket.open(live.wsUrl);
    s2.send({ type: 'auth', payload: { token: a.accessToken } });
    await s2.waitFor('ready');

    expect(live.hub.isOnline(a.user.id)).toBe(true);

    s1.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(live.hub.isOnline(a.user.id)).toBe(true); // still one socket left

    s2.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(live.hub.isOnline(a.user.id)).toBe(false);
  });
});
