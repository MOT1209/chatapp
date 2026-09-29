import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';

let app: Express;

beforeAll(() => {
  app = buildTestApp();
});

afterEach(async () => {
  await resetDb();
});

async function createConversation(a: Awaited<ReturnType<typeof registerUser>>, b: Awaited<ReturnType<typeof registerUser>>) {
  const res = await request(app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${a.accessToken}`)
    .send({ participantId: b.user.id });
  return res.body.id as string;
}

describe('POST /api/conversations/:id/messages', () => {
  it('sends a message and returns it with server-assigned id/createdAt', async () => {
    const a = await registerUser(app, { username: 'sendA' });
    const b = await registerUser(app, { username: 'sendB' });
    const conversationId = await createConversation(a, b);

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'client-1', body: 'Hello' });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe('Hello');
    expect(res.body.clientId).toBe('client-1');
    expect(res.body.status).toBe('sent');
    expect(res.body.sender.id).toBe(a.user.id);
    expect(typeof res.body.id).toBe('string');
    expect(typeof res.body.createdAt).toBe('string');
  });

  it('deduplicates a retried send by (senderId, clientId), returning 200 not 201', async () => {
    const a = await registerUser(app, { username: 'dedupA' });
    const b = await registerUser(app, { username: 'dedupB' });
    const conversationId = await createConversation(a, b);

    const first = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'retry-1', body: 'Hello' });

    const retry = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'retry-1', body: 'Hello' });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
  });

  it('returns one message, not a 500, when the same clientId is sent concurrently', async () => {
    const a = await registerUser(app, { username: 'raceA' });
    const b = await registerUser(app, { username: 'raceB' });
    const conversationId = await createConversation(a, b);

    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        request(app)
          .post(`/api/conversations/${conversationId}/messages`)
          .set('Authorization', `Bearer ${a.accessToken}`)
          .send({ clientId: 'race-1', body: 'Hello' }),
      ),
    );

    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id as string)).size).toBe(1);
  });

  it('rejects an empty body as VALIDATION_ERROR', async () => {
    const a = await registerUser(app, { username: 'emptyA' });
    const b = await registerUser(app, { username: 'emptyB' });
    const conversationId = await createConversation(a, b);

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'c1', body: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-member sending into a conversation with NOT_FOUND', async () => {
    const a = await registerUser(app, { username: 'memberA' });
    const b = await registerUser(app, { username: 'memberB' });
    const outsider = await registerUser(app, { username: 'outsider' });
    const conversationId = await createConversation(a, b);

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ clientId: 'c1', body: 'sneaky' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/conversations/:id/messages — cursor validation', () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

  it.each([
    ['garbage that is not base64 JSON', 'not-a-cursor'],
    ['valid JSON with an unparseable date', encode({ id: 'x', createdAt: 'not-a-date' })],
    ['valid JSON with a missing id', encode({ createdAt: '2026-01-01T00:00:00.000Z' })],
  ])('rejects %s with VALIDATION_ERROR instead of a 500', async (_label, cursor) => {
    const a = await registerUser(app, { username: 'curA' });
    const b = await registerUser(app, { username: 'curB' });
    const conversationId = await createConversation(a, b);

    const res = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .query({ cursor });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/conversations/:id/messages', () => {
  it('returns messages oldest to newest and paginates with a cursor', async () => {
    const a = await registerUser(app, { username: 'pageA' });
    const b = await registerUser(app, { username: 'pageB' });
    const conversationId = await createConversation(a, b);

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${a.accessToken}`)
        .send({ clientId: `seq-${i}`, body: `message ${i}` });
    }

    const firstPage = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${a.accessToken}`);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.messages).toHaveLength(2);
    expect(firstPage.body.messages[0].body).toBe('message 3');
    expect(firstPage.body.messages[1].body).toBe('message 4');
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .query({ limit: 2, cursor: firstPage.body.nextCursor as string })
      .set('Authorization', `Bearer ${a.accessToken}`);

    expect(secondPage.body.messages).toHaveLength(2);
    expect(secondPage.body.messages[0].body).toBe('message 1');
    expect(secondPage.body.messages[1].body).toBe('message 2');

    const thirdPage = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .query({ limit: 2, cursor: secondPage.body.nextCursor as string })
      .set('Authorization', `Bearer ${a.accessToken}`);

    expect(thirdPage.body.messages).toHaveLength(1);
    expect(thirdPage.body.messages[0].body).toBe('message 0');
    expect(thirdPage.body.nextCursor).toBeNull();
  });

  it('rejects a non-member with NOT_FOUND', async () => {
    const a = await registerUser(app, { username: 'histA' });
    const b = await registerUser(app, { username: 'histB' });
    const outsider = await registerUser(app, { username: 'histOutsider' });
    const conversationId = await createConversation(a, b);

    const res = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${outsider.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/conversations/:id/read', () => {
  it('marks messages read and is idempotent', async () => {
    const a = await registerUser(app, { username: 'readA' });
    const b = await registerUser(app, { username: 'readB' });
    const conversationId = await createConversation(a, b);

    const sent = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'c1', body: 'Hi B' });

    const readRes = await request(app)
      .post(`/api/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ messageId: sent.body.id });
    expect(readRes.status).toBe(204);

    const list = await request(app).get('/api/conversations').set('Authorization', `Bearer ${b.accessToken}`);
    expect(list.body.conversations[0].unreadCount).toBe(0);
    expect(list.body.conversations[0].lastMessage.status).toBe('read');

    // Calling again must not error.
    const again = await request(app)
      .post(`/api/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ messageId: sent.body.id });
    expect(again.status).toBe(204);
  });

  it('reduces unreadCount for the recipient before reading', async () => {
    const a = await registerUser(app, { username: 'unreadA' });
    const b = await registerUser(app, { username: 'unreadB' });
    const conversationId = await createConversation(a, b);

    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'c1', body: 'one' });
    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'c2', body: 'two' });

    const list = await request(app).get('/api/conversations').set('Authorization', `Bearer ${b.accessToken}`);
    expect(list.body.conversations[0].unreadCount).toBe(2);
  });
});

describe('DELETE /api/conversations/:id/messages/:messageId', () => {
  it('lets the sender delete their own message', async () => {
    const a = await registerUser(app, { username: 'delA' });
    const b = await registerUser(app, { username: 'delB' });
    const conversationId = await createConversation(a, b);

    const sent = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'c1', body: 'oops' });

    const res = await request(app)
      .delete(`/api/conversations/${conversationId}/messages/${String(sent.body.id)}`)
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(res.status).toBe(204);

    const page = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(page.body.messages[0].body).toBe('');
    expect(page.body.messages[0].deletedAt).toBeTruthy();
  });

  it('forbids deleting someone else\'s message', async () => {
    const a = await registerUser(app, { username: 'ownerA' });
    const b = await registerUser(app, { username: 'ownerB' });
    const conversationId = await createConversation(a, b);

    const sent = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'c1', body: 'mine' });

    const res = await request(app)
      .delete(`/api/conversations/${conversationId}/messages/${String(sent.body.id)}`)
      .set('Authorization', `Bearer ${b.accessToken}`);
    expect(res.status).toBe(403);
  });
});
