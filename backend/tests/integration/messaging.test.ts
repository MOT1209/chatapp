import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { makeApp, registerUser, type Harness, type RegisteredUser } from '../helpers/harness.js';

const auth = (u: RegisteredUser) => `Bearer ${u.accessToken}`;

async function conversation(): Promise<{ h: Harness; a: RegisteredUser; b: RegisteredUser; convId: string }> {
  const h = makeApp();
  const a = await registerUser(h.app);
  const b = await registerUser(h.app);
  const conv = await request(h.app).post('/api/conversations').set('Authorization', auth(a)).send({ participantId: b.user.id });
  return { h, a, b, convId: conv.body.id };
}

describe('POST /api/conversations/:id/messages', () => {
  it('sends a message with a server-set createdAt and sent status', async () => {
    const { h, a, convId } = await conversation();
    const clientId = randomUUID();
    const res = await request(h.app).post(`/api/conversations/${convId}/messages`).set('Authorization', auth(a)).send({ clientId, body: 'Hello' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ clientId, body: 'Hello', status: 'sent', readAt: null, conversationId: convId });
    expect(typeof res.body.createdAt).toBe('string');
    expect(res.body.sender.id).toBe(a.user.id);
  });

  it('is idempotent on a duplicate clientId (retry returns the same message, 200)', async () => {
    const { h, a, convId } = await conversation();
    const clientId = randomUUID();
    const first = await request(h.app).post(`/api/conversations/${convId}/messages`).set('Authorization', auth(a)).send({ clientId, body: 'once' });
    const retry = await request(h.app).post(`/api/conversations/${convId}/messages`).set('Authorization', auth(a)).send({ clientId, body: 'once' });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);

    // Only one message actually exists.
    const list = await request(h.app).get(`/api/conversations/${convId}/messages`).set('Authorization', auth(a));
    expect(list.body.messages).toHaveLength(1);
  });

  it('rejects empty and whitespace-only bodies', async () => {
    const { h, a, convId } = await conversation();
    const empty = await request(h.app).post(`/api/conversations/${convId}/messages`).set('Authorization', auth(a)).send({ clientId: randomUUID(), body: '' });
    const spaces = await request(h.app).post(`/api/conversations/${convId}/messages`).set('Authorization', auth(a)).send({ clientId: randomUUID(), body: '    ' });
    expect(empty.status).toBe(400);
    expect(spaces.status).toBe(400);
  });

  it('404s when a non-member tries to send', async () => {
    const { h, convId } = await conversation();
    const outsider = await registerUser(h.app, { username: 'eve', email: 'eve@e.com' });
    const res = await request(h.app).post(`/api/conversations/${convId}/messages`).set('Authorization', auth(outsider)).send({ clientId: randomUUID(), body: 'intrude' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/conversations/:id/messages — pagination', () => {
  it('returns oldest→newest and pages backwards with a cursor', async () => {
    const { h, a, convId } = await conversation();
    for (const body of ['m1', 'm2', 'm3']) {
      await request(h.app).post(`/api/conversations/${convId}/messages`).set('Authorization', auth(a)).send({ clientId: randomUUID(), body });
      await new Promise((r) => setTimeout(r, 2)); // keep createdAt strictly increasing
    }

    const page1 = await request(h.app).get(`/api/conversations/${convId}/messages?limit=2`).set('Authorization', auth(a));
    expect(page1.body.messages.map((m: { body: string }) => m.body)).toEqual(['m2', 'm3']);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(h.app)
      .get(`/api/conversations/${convId}/messages?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set('Authorization', auth(a));
    expect(page2.body.messages.map((m: { body: string }) => m.body)).toEqual(['m1']);
    expect(page2.body.nextCursor).toBeNull();
  });
});

describe('read receipts and unread counts', () => {
  it('counts unread for the recipient and clears on read', async () => {
    const { h, a, b, convId } = await conversation();
    const sent = await request(h.app).post(`/api/conversations/${convId}/messages`).set('Authorization', auth(a)).send({ clientId: randomUUID(), body: 'hey' });

    // B sees one unread.
    let bList = await request(h.app).get('/api/conversations').set('Authorization', auth(b));
    expect(bList.body.conversations[0].unreadCount).toBe(1);

    // B reads up to the message.
    const read = await request(h.app).post(`/api/conversations/${convId}/read`).set('Authorization', auth(b)).send({ messageId: sent.body.id });
    expect(read.status).toBe(204);

    // Unread cleared for B...
    bList = await request(h.app).get('/api/conversations').set('Authorization', auth(b));
    expect(bList.body.conversations[0].unreadCount).toBe(0);

    // ...and A now sees the message as read.
    const aList = await request(h.app).get(`/api/conversations/${convId}/messages`).set('Authorization', auth(a));
    expect(aList.body.messages[0].status).toBe('read');
    expect(aList.body.messages[0].readAt).toBeTruthy();
  });

  it('404s when marking a message from another conversation', async () => {
    const { h, a, b, convId } = await conversation();
    const c = await registerUser(h.app);
    const otherConv = await request(h.app).post('/api/conversations').set('Authorization', auth(b)).send({ participantId: c.user.id });
    const otherMsg = await request(h.app).post(`/api/conversations/${otherConv.body.id}/messages`).set('Authorization', auth(b)).send({ clientId: randomUUID(), body: 'x' });

    const res = await request(h.app).post(`/api/conversations/${convId}/read`).set('Authorization', auth(a)).send({ messageId: otherMsg.body.id });
    expect(res.status).toBe(404);
  });
});
