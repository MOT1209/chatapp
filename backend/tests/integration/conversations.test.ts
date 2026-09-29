import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser, type RegisteredUser } from '../helpers/harness.js';

async function pair() {
  const { app } = makeApp();
  const a = await registerUser(app, { username: 'alice', email: 'alice@example.com' });
  const b = await registerUser(app, { username: 'bob', email: 'bob@example.com' });
  return { app, a, b };
}

function auth(user: RegisteredUser) {
  return `Bearer ${user.accessToken}`;
}

describe('POST /api/conversations', () => {
  it('creates a direct conversation whose participant is the other user', async () => {
    const { app, a, b } = await pair();
    const res = await request(app).post('/api/conversations').set('Authorization', auth(a)).send({ participantId: b.user.id });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('direct');
    expect(res.body.participant.id).toBe(b.user.id);
    expect(res.body.unreadCount).toBe(0);
    expect(res.body.lastMessage).toBeNull();
  });

  it('is idempotent for the same pair (no duplicates)', async () => {
    const { app, a, b } = await pair();
    const first = await request(app).post('/api/conversations').set('Authorization', auth(a)).send({ participantId: b.user.id });
    const second = await request(app).post('/api/conversations').set('Authorization', auth(b)).send({ participantId: a.user.id });
    expect(first.body.id).toBe(second.body.id);
  });

  it('rejects a conversation with yourself', async () => {
    const { app, a } = await pair();
    const res = await request(app).post('/api/conversations').set('Authorization', auth(a)).send({ participantId: a.user.id });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown participant', async () => {
    const { app, a } = await pair();
    const res = await request(app).post('/api/conversations').set('Authorization', auth(a)).send({ participantId: 'nobody' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/conversations', () => {
  it('is empty for a brand-new user', async () => {
    const { app, a } = await pair();
    const res = await request(app).get('/api/conversations').set('Authorization', auth(a));
    expect(res.status).toBe(200);
    expect(res.body.conversations).toEqual([]);
  });

  it('lists conversations most-recent first', async () => {
    const { app } = makeApp();
    const a = await registerUser(app);
    const b = await registerUser(app);
    const c = await registerUser(app);

    const ab = await request(app).post('/api/conversations').set('Authorization', auth(a)).send({ participantId: b.user.id });
    const ac = await request(app).post('/api/conversations').set('Authorization', auth(a)).send({ participantId: c.user.id });

    // Make the a–b conversation the most recent by sending a message in it.
    await request(app).post(`/api/conversations/${ab.body.id}/messages`).set('Authorization', auth(a)).send({ clientId: crypto.randomUUID(), body: 'hi' });

    const list = await request(app).get('/api/conversations').set('Authorization', auth(a));
    expect(list.body.conversations[0].id).toBe(ab.body.id);
    expect(list.body.conversations[1].id).toBe(ac.body.id);
  });
});

describe('conversation access control', () => {
  it('404s when a non-member reads messages', async () => {
    const { app, a, b } = await pair();
    const outsider = await registerUser(app, { username: 'eve', email: 'eve@example.com' });
    const conv = await request(app).post('/api/conversations').set('Authorization', auth(a)).send({ participantId: b.user.id });

    const res = await request(app).get(`/api/conversations/${conv.body.id}/messages`).set('Authorization', auth(outsider));
    expect(res.status).toBe(404);
  });

  it('404s for an invalid conversation id', async () => {
    const { app, a } = await pair();
    const res = await request(app).get('/api/conversations/nope/messages').set('Authorization', auth(a));
    expect(res.status).toBe(404);
  });
});
