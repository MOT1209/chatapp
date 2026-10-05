import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../src/lib/prisma.js';
import { resetDb } from './helpers/db.js';
import { buildTestApp, registerUser, type AuthedUser } from './helpers/test-app.js';

// Cursor pagination is only correct if the sort order is *total*. The existing tests
// create rows one request at a time, so every row gets a distinct timestamp and a
// broken tie-break would still pass. These tests seed rows that share a handful of
// timestamps — exactly what a burst of messages or a bulk import produces — and walk
// every page, asserting nothing is duplicated, skipped or out of order.

let app: Express;

beforeAll(() => {
  app = buildTestApp();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type Page = { nextCursor: string | null };

/** Follows `nextCursor` until exhausted, returning the item ids of every page in order. */
async function walk<T extends Page>(
  user: AuthedUser,
  url: string,
  limit: number,
  pick: (page: T) => { id: string }[],
): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: string | null = null;
  // The guard turns an infinite-loop regression (a cursor that never advances) into a
  // clear failure instead of a hung test.
  for (let guard = 0; guard < 500; guard += 1) {
    const res: request.Response = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ limit, ...(cursor ? { cursor } : {}) });
    expect(res.status).toBe(200);
    const body = res.body as T;
    pages.push(pick(body).map((item) => item.id));
    cursor = body.nextCursor;
    if (!cursor) return pages;
  }
  throw new Error('pagination did not terminate');
}

describe('cursor pagination under heavy timestamp ties', () => {
  it('walks 150 messages that share only 4 distinct timestamps with no duplicate, gap or reorder', async () => {
    const a = await registerUser(app, { username: 'stressA' });
    const b = await registerUser(app, { username: 'stressB' });
    const created = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });
    const conversationId = created.body.id as string;

    const base = Date.now() - 60_000;
    const total = 150;
    await prisma.message.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        conversationId,
        senderId: i % 2 === 0 ? a.user.id : b.user.id,
        clientId: `bulk-${i}`,
        body: `message ${i}`,
        // 4 timestamps, ~37 rows each: ties are the rule, not the exception.
        createdAt: new Date(base + (i % 4) * 1000),
      })),
    });

    // Expected order is the API's order: newest page first, oldest-to-newest inside a page,
    // which is the same total order (createdAt, id) reversed.
    const expected = (await prisma.message.findMany({ where: { conversationId } }))
      .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || (x.id < y.id ? -1 : 1))
      .map((m) => m.id);

    for (const limit of [1, 7, 30, 100]) {
      const pages = await walk<Page & { messages: { id: string }[] }>(
        a,
        `/api/conversations/${conversationId}/messages`,
        limit,
        (p) => p.messages,
      );
      const flat = pages.flat();
      expect(new Set(flat).size, `limit=${limit}: duplicate ids`).toBe(flat.length);
      expect(flat, `limit=${limit}: wrong set or order`).toHaveLength(total);
      // Pages arrive newest-first; flattening them in reverse page order yields oldest-first.
      expect(pages.slice().reverse().flat(), `limit=${limit}: not in (createdAt, id) order`).toEqual(expected);
      for (const page of pages.slice(0, -1)) {
        expect(page, `limit=${limit}: a non-final page was not full`).toHaveLength(limit);
      }
    }
  }, 60_000);

  it('does not repeat or lose rows when a message arrives between two pages', async () => {
    const a = await registerUser(app, { username: 'liveA' });
    const b = await registerUser(app, { username: 'liveB' });
    const created = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ participantId: b.user.id });
    const conversationId = created.body.id as string;

    const base = Date.now() - 60_000;
    await prisma.message.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        conversationId,
        senderId: a.user.id,
        clientId: `seed-${i}`,
        body: `seed ${i}`,
        createdAt: new Date(base + (i % 2) * 1000),
      })),
    });

    const url = `/api/conversations/${conversationId}/messages`;
    const first = await request(app).get(url).query({ limit: 8 }).set('Authorization', `Bearer ${a.accessToken}`);
    expect(first.body.messages).toHaveLength(8);

    // A brand-new message lands (newest of all) while the client is mid-scroll.
    await request(app)
      .post(url)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientId: 'arrives-late', body: 'late' });

    // Resuming from the first page's cursor must return only rows strictly older than it.
    const second = await request(app)
      .get(url)
      .query({ limit: 100, cursor: first.body.nextCursor as string })
      .set('Authorization', `Bearer ${a.accessToken}`);
    const firstIds = new Set((first.body.messages as { id: string }[]).map((m) => m.id));
    const secondIds = (second.body.messages as { id: string; body: string }[]).map((m) => m.id);
    expect(secondIds).toHaveLength(12);
    expect(secondIds.some((id) => firstIds.has(id))).toBe(false);
    expect((second.body.messages as { body: string }[]).some((m) => m.body === 'late')).toBe(false);
  }, 60_000);

  it('walks 45 conversations that share one updatedAt with no duplicate, gap or reorder', async () => {
    const a = await registerUser(app, { username: 'listA' });
    const total = 45;
    const sameInstant = new Date(Date.now() - 30_000);

    const others = Array.from({ length: total }, (_, i) => ({
      id: `peer-${String(i).padStart(3, '0')}`,
      email: `peer${i}@example.com`,
      username: `peer${i}`,
      displayName: `Peer ${i}`,
      passwordHash: 'not-a-real-hash',
    }));
    await prisma.user.createMany({ data: others });
    await prisma.conversation.createMany({
      data: others.map((o) => ({
        id: `conv-${o.id}`,
        directKey: [a.user.id, o.id].sort().join(':'),
        updatedAt: sameInstant,
      })),
    });
    await prisma.conversationMember.createMany({
      data: others.flatMap((o) => [
        { conversationId: `conv-${o.id}`, userId: a.user.id },
        { conversationId: `conv-${o.id}`, userId: o.id },
      ]),
    });

    const expected = others.map((o) => `conv-${o.id}`).sort().reverse(); // updatedAt desc, id desc

    for (const limit of [1, 10, 44, 100]) {
      const pages = await walk<Page & { conversations: { id: string }[] }>(
        a,
        '/api/conversations',
        limit,
        (p) => p.conversations,
      );
      const flat = pages.flat();
      expect(new Set(flat).size, `limit=${limit}: duplicate ids`).toBe(flat.length);
      expect(flat, `limit=${limit}: wrong set or order`).toEqual(expected);
    }
  }, 60_000);
});
