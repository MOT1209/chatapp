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

describe('POST /api/conversations', () => {
  it('creates a direct conversation', async () => {
    const a = await registerUser(app, { username: 'convA' });
    const b = await registerUser(app, { username: 'convB' });

    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('direct');
    expect(res.body.participant.id).toBe(b.user.id);
    expect(res.body.lastMessage).toBeNull();
    expect(res.body.unreadCount).toBe(0);
  });

  it('is idempotent: a second call returns the same conversation', async () => {
    const a = await registerUser(app, { username: 'idemA' });
    const b = await registerUser(app, { username: 'idemB' });

    const first = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });

    const second = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it('is idempotent regardless of which side initiates', async () => {
    const a = await registerUser(app, { username: 'flipA' });
    const b = await registerUser(app, { username: 'flipB' });

    const first = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });

    const second = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ participantId: a.user.id });

    expect(second.body.id).toBe(first.body.id);
  });

  it('rejects starting a conversation with yourself', async () => {
    const a = await registerUser(app);
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: a.user.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown participantId with NOT_FOUND', async () => {
    const a = await registerUser(app);
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/conversations', () => {
  it('lists conversations sorted by updatedAt descending', async () => {
    const a = await registerUser(app, { username: 'listA' });
    const b = await registerUser(app, { username: 'listB' });
    const c = await registerUser(app, { username: 'listC' });

    const convB = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });

    await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: c.user.id });

    // Sending a message on the B conversation bumps its updatedAt to the top.
    await request(app)
      .post(`/api/conversations/${String(convB.body.id)}/messages`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'c1', body: 'hi' });

    const res = await request(app).get('/api/conversations').set('Authorization', `Bearer ${a.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.conversations).toHaveLength(2);
    expect(res.body.conversations[0].participant.username).toBe('listb');
  });

  it('returns an empty array for a user with no conversations', async () => {
    const a = await registerUser(app);
    const res = await request(app).get('/api/conversations').set('Authorization', `Bearer ${a.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.conversations).toEqual([]);
  });
});
