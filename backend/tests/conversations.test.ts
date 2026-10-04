import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';
import { prisma } from '../src/lib/prisma.js';
import { listConversationsQuerySchema } from '../src/validators/conversations.validators.js';

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

  it('paginates with limit and nextCursor without losing conversations', async () => {
    const a = await registerUser(app, { username: 'pagerA' });
    const others = [];
    for (const name of ['pagerB', 'pagerC', 'pagerD']) {
      others.push(await registerUser(app, { username: name }));
    }
    const convIds: string[] = [];
    for (const other of others) {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${a.accessToken}`)
        .send({ participantId: other.user.id });
      convIds.push(String(res.body.id));
    }

    // Make the ordering deterministic: conv2 newest, conv1 middle, conv0 oldest.
    const base = Date.now() - 60_000;
    await prisma.conversation.update({ where: { id: convIds[0] }, data: { updatedAt: new Date(base) } });
    await prisma.conversation.update({ where: { id: convIds[1] }, data: { updatedAt: new Date(base + 20_000) } });
    await prisma.conversation.update({ where: { id: convIds[2] }, data: { updatedAt: new Date(base + 40_000) } });

    const first = await request(app)
      .get('/api/conversations')
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(first.status).toBe(200);
    expect(first.body.conversations.map((c: { id: string }) => c.id)).toEqual([convIds[2], convIds[1]]);
    expect(typeof first.body.nextCursor).toBe('string');

    const second = await request(app)
      .get('/api/conversations')
      .query({ limit: 2, cursor: first.body.nextCursor })
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(second.status).toBe(200);
    expect(second.body.conversations.map((c: { id: string }) => c.id)).toEqual([convIds[0]]);
    expect(second.body.nextCursor).toBeNull();
  });

  it('rejects an invalid cursor with VALIDATION_ERROR', async () => {
    const a = await registerUser(app, { username: 'badcursor' });
    const res = await request(app)
      .get('/api/conversations')
      .query({ cursor: 'not-a-real-cursor' })
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.cursor).toBeDefined();
  });

  it('rejects out-of-range limits', async () => {
    const a = await registerUser(app, { username: 'limitcheck' });
    for (const limit of ['0', '101']) {
      const res = await request(app)
        .get('/api/conversations')
        .query({ limit })
        .set('Authorization', `Bearer ${a.accessToken}`);
      expect(res.status, `limit=${limit} must be rejected`).toBe(400);
    }
  });

  it('defaults to a 50-item page so old clients stay bounded', () => {
    // The default matters for clients that send no query params at all.
    expect(listConversationsQuerySchema.parse({}).limit).toBe(50);
    expect(listConversationsQuerySchema.parse({}).cursor).toBeUndefined();
  });
});
