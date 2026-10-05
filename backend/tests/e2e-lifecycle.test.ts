import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { WebSocket, type RawData } from 'ws';
import request from 'supertest';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { createWsServer } from '../src/realtime/ws-server.js';
import { buildTestApp, registerUser, type AuthedUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';

/**
 * Second half of the end-to-end journey (e2e.test.ts covers register → search → create →
 * send → typing → read → reply). This continues the same two people through the parts that
 * only matter once a session has history: retrying a send, deleting, signing out, signing back
 * in and finding everything where it was, and what a bad request or a dead token looks like on
 * the wire. Real HTTP, real WebSocket, real PostgreSQL; no mocks on the backend side.
 */

let server: Server;
let wsUrl: string;
let app: ReturnType<typeof buildTestApp>;
const sockets: WebSocket[] = [];

beforeAll(async () => {
  app = buildTestApp();
  server = app.listen(0);
  createWsServer(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await new Promise((resolve) => setTimeout(resolve, 60));
  await resetDb();
});

type Frame = { type: string; payload: Record<string, unknown> };
type MessagePayload = { id: string; body: string; deletedAt: string | null };

/** Records every frame a socket receives, so "exactly once" can be asserted, not just "at least once". */
class Inbox {
  readonly frames: Frame[] = [];
  constructor(readonly socket: WebSocket) {
    socket.on('message', (raw: RawData) => this.frames.push(JSON.parse(raw.toString()) as Frame));
  }
  of(type: string): Frame[] {
    return this.frames.filter((f) => f.type === type);
  }
  async next(type: string, timeoutMs = 2000): Promise<Frame> {
    const started = Date.now();
    for (;;) {
      const hit = this.of(type)[0];
      if (hit) return hit;
      if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for a "${type}" frame`);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
  closed(): Promise<number> {
    return new Promise((resolve) => {
      if (this.socket.readyState === WebSocket.CLOSED) return resolve(-1);
      this.socket.once('close', (code) => resolve(code));
    });
  }
}

async function connectAs(token: string): Promise<Inbox> {
  const socket = new WebSocket(wsUrl);
  sockets.push(socket);
  const inbox = new Inbox(socket);
  await new Promise<void>((resolve) => socket.once('open', () => resolve()));
  socket.send(JSON.stringify({ type: 'auth', payload: { token } }));
  await inbox.next('ready');
  return inbox;
}

const authHeader = (u: { accessToken: string }): [string, string] => ['Authorization', `Bearer ${u.accessToken}`];

describe('End-to-end lifecycle: retry, delete, sign out, sign back in', () => {
  it('keeps one consistent story through a retried send, a delete, a logout and a fresh login', async () => {
    const password = 'correct-horse-battery';
    const ahmad = await registerUser(app, { username: 'life_ahmad', password });
    const sara = await registerUser(app, { username: 'life_sara', password });
    const conversationId = (
      await request(app)
        .post('/api/conversations')
        .set(...authHeader(ahmad))
        .send({ participantId: sara.user.id })
    ).body.id as string;
    const messagesUrl = `/api/conversations/${conversationId}/messages`;

    const ahmadWs = await connectAs(ahmad.accessToken);
    const saraWs = await connectAs(sara.accessToken);

    // 1. Network failure and retry: the client never saw the first response, so it sends the
    //    same clientId again. The user must end up with ONE message, and Sara must be told once.
    const first = await request(app).post(messagesUrl).set(...authHeader(ahmad)).send({ clientId: 'retry-1', body: 'are you there?' });
    const retry = await request(app).post(messagesUrl).set(...authHeader(ahmad)).send({ clientId: 'retry-1', body: 'are you there?' });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(saraWs.of('message:new')).toHaveLength(1);

    // 2. Sara reads it over REST; Ahmad is told live, and her unread badge clears.
    await request(app).post(`/api/conversations/${conversationId}/read`).set(...authHeader(sara)).send({ messageId: first.body.id });
    expect((await ahmadWs.next('read')).payload.messageId).toBe(first.body.id);

    // 3. Ahmad deletes it. Sara's client is told to blank it out rather than silently losing it.
    const del = await request(app).delete(`${messagesUrl}/${first.body.id as string}`).set(...authHeader(ahmad));
    expect(del.status).toBe(204);
    const updated = (await saraWs.next('message:updated')).payload.message as MessagePayload;
    expect(updated.id).toBe(first.body.id);
    expect(updated.deletedAt).not.toBeNull();
    expect(updated.body).toBe('');

    // 4. A second message lands after the delete.
    const second = await request(app).post(messagesUrl).set(...authHeader(ahmad)).send({ clientId: 'after-delete', body: 'sorry, wrong chat' });
    expect(second.status).toBe(201);

    // 5. Ahmad signs out. His socket must not outlive his credentials, and his refresh token dies.
    const ahmadClosed = ahmadWs.closed();
    const logout = await request(app).post('/api/auth/logout').set(...authHeader(ahmad)).send({ refreshToken: ahmad.refreshToken });
    expect(logout.status).toBe(204);
    expect(await ahmadClosed).toBe(4401);
    const stale = await request(app).post('/api/auth/refresh').send({ refreshToken: ahmad.refreshToken });
    expect(stale.status).toBe(401);

    // 6. He signs back in with his password and finds everything where he left it.
    const relogin = await request(app).post('/api/auth/login').send({ identifier: 'life_ahmad', password });
    expect(relogin.status).toBe(200);
    const back: AuthedUser = relogin.body as AuthedUser;
    // A new session, proven by its refresh token. (Not the access token: that is a JWT of just
    // `sub` + `iat` in whole seconds, so a login in the same second as the registration yields
    // the identical string.)
    expect(back.refreshToken).not.toBe(ahmad.refreshToken);
    expect(back.user.id).toBe(ahmad.user.id);

    const list = await request(app).get('/api/conversations').set(...authHeader(back));
    expect(list.body.conversations).toHaveLength(1);
    expect(list.body.conversations[0].id).toBe(conversationId);
    // The deleted message is not a preview: the list falls back to the newest live one.
    expect(list.body.conversations[0].lastMessage.body).toBe('sorry, wrong chat');

    const history = await request(app).get(messagesUrl).set(...authHeader(back));
    expect(history.body.messages.map((m: { body: string; deletedAt: string | null }) => [m.body, m.deletedAt !== null])).toEqual([
      ['', true],
      ['sorry, wrong chat', false],
    ]);

    // 7. Sara's side agrees: one unread (the live one); the deleted one never counts.
    const saraList = await request(app).get('/api/conversations').set(...authHeader(sara));
    expect(saraList.body.conversations[0].unreadCount).toBe(1);
  }, 30_000);

  it('answers bad requests and dead credentials with the standard envelope, never a crash', async () => {
    const a = await registerUser(app, { username: 'bad_a' });
    const b = await registerUser(app, { username: 'bad_b' });
    const outsider = await registerUser(app, { username: 'bad_out' });
    const conversationId = (
      await request(app).post('/api/conversations').set(...authHeader(a)).send({ participantId: b.user.id })
    ).body.id as string;
    const messagesUrl = `/api/conversations/${conversationId}/messages`;
    const sent = await request(app).post(messagesUrl).set(...authHeader(a)).send({ clientId: 'x1', body: 'hi' });

    const envelope = (res: request.Response, status: number, code: string): void => {
      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
      expect(Object.keys(res.body)).toEqual(['error']);
    };

    envelope(await request(app).post(messagesUrl).set(...authHeader(a)).send({ clientId: 'x2', body: '   ' }), 400, 'VALIDATION_ERROR');
    envelope(await request(app).post(messagesUrl).set(...authHeader(a)).send({ clientId: 'x3', body: 'y'.repeat(4001) }), 400, 'VALIDATION_ERROR');
    envelope(await request(app).get(messagesUrl).query({ cursor: 'garbage' }).set(...authHeader(a)), 400, 'VALIDATION_ERROR');
    envelope(await request(app).get(messagesUrl).query({ limit: 1000 }).set(...authHeader(a)), 400, 'VALIDATION_ERROR');
    // Someone outside the conversation learns nothing about it: same answer as "does not exist".
    envelope(await request(app).get(messagesUrl).set(...authHeader(outsider)), 404, 'NOT_FOUND');
    envelope(await request(app).post(messagesUrl).set(...authHeader(outsider)).send({ clientId: 'x4', body: 'hi' }), 404, 'NOT_FOUND');
    // A participant may not delete the other person's message.
    envelope(await request(app).delete(`${messagesUrl}/${sent.body.id as string}`).set(...authHeader(b)), 403, 'FORBIDDEN');
    // A clientId cannot be reused in another conversation by the same sender.
    const other = await registerUser(app, { username: 'bad_other' });
    const secondConv = (
      await request(app).post('/api/conversations').set(...authHeader(a)).send({ participantId: other.user.id })
    ).body.id as string;
    envelope(
      await request(app).post(`/api/conversations/${secondConv}/messages`).set(...authHeader(a)).send({ clientId: 'x1', body: 'hi' }),
      400,
      'VALIDATION_ERROR',
    );

    // An expired access token: REST says TOKEN_EXPIRED (so the client refreshes), WebSocket closes 4401.
    const expired = jwt.sign({ sub: a.user.id }, env.JWT_ACCESS_SECRET, { expiresIn: -30 });
    envelope(await request(app).get('/api/conversations').set('Authorization', `Bearer ${expired}`), 401, 'TOKEN_EXPIRED');
    const ws = new WebSocket(wsUrl);
    sockets.push(ws);
    const inbox = new Inbox(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    const closed = inbox.closed();
    ws.send(JSON.stringify({ type: 'auth', payload: { token: expired } }));
    expect(await closed).toBe(4401);
    expect(inbox.of('error')[0]?.payload.code).toBe('TOKEN_EXPIRED');
  }, 30_000);
});
