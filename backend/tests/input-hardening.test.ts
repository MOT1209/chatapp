import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../src/lib/prisma.js';
import { resetDb } from './helpers/db.js';
import { buildTestApp, registerUser, type AuthedUser } from './helpers/test-app.js';

// Hostile or merely broken input must produce a client error in the standard error
// envelope, never a 500. PostgreSQL rejects NUL bytes and ill-formed UTF-16 (a lone
// surrogate, e.g. an emoji cut in half by a client that truncates by code unit), and
// Prisma surfaces that as an internal error unless the API refuses the text first.

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

const LONE_HIGH = '\\ud800';
const LONE_LOW = '\\udc00';

function postRaw(path: string, rawJson: string, token?: string): request.Test {
  const req = request(app).post(path).set('Content-Type', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req.send(rawJson);
}

function expectEnvelope(res: request.Response, status: number, code: string): void {
  expect(res.status).toBe(status);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe('string');
  // The envelope carries nothing but code, message and (for validation) fields.
  expect(Object.keys(res.body)).toEqual(['error']);
}

const registerBody = (displayName: string, n = 1): string =>
  `{"username":"hard${n}","email":"hard${n}@example.com","password":"correct-horse-battery","displayName":"${displayName}"}`;

describe('ill-formed text is a 400, not a 500', () => {
  it.each([
    ['a lone high surrogate', `bad${LONE_HIGH}name`],
    ['a lone low surrogate', `bad${LONE_LOW}name`],
    ['a high surrogate at the very end', `end${LONE_HIGH}`],
    ['a NUL byte', 'a\\u0000b'],
  ])('rejects %s in a body field', async (_label, text) => {
    expectEnvelope(await postRaw('/api/auth/register', registerBody(text)), 400, 'VALIDATION_ERROR');
  });

  it('rejects ill-formed text in a JSON key and in nested values', async () => {
    expectEnvelope(await postRaw('/api/auth/login', `{"${LONE_HIGH}":"x","identifier":"a","password":"b"}`), 400, 'VALIDATION_ERROR');
    expectEnvelope(
      await postRaw('/api/auth/login', `{"identifier":{"deep":[["x","${LONE_LOW}"]]},"password":"b"}`),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('still accepts valid surrogate pairs (emoji) and non-Latin text', async () => {
    const res = await postRaw('/api/auth/register', registerBody('Ali 😀 مرحبا Ünï', 2));
    expect(res.status).toBe(201);
    expect(res.body.user.displayName).toBe('Ali 😀 مرحبا Ünï');
  });

  describe('message bodies', () => {
    let a: AuthedUser;
    let conversationId: string;

    beforeEach(async () => {
      a = await registerUser(app, { username: 'sendA' });
      const b = await registerUser(app, { username: 'sendB' });
      const conv = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${a.accessToken}`)
        .send({ participantId: b.user.id });
      conversationId = conv.body.id as string;
    });

    const send = (clientId: string, escapedBody: string): request.Test =>
      postRaw(`/api/conversations/${conversationId}/messages`, `{"clientId":"${clientId}","body":"${escapedBody}"}`, a.accessToken);

    it('rejects a half emoji and a NUL byte', async () => {
      expectEnvelope(await send('m1', `hi ${LONE_HIGH}`), 400, 'VALIDATION_ERROR');
      expectEnvelope(await send('m2', 'x\\u0000y'), 400, 'VALIDATION_ERROR');
    });

    it('rejects an ill-formed clientId', async () => {
      expectEnvelope(await send(`id${LONE_HIGH}`, 'hello'), 400, 'VALIDATION_ERROR');
    });

    it('stores nothing for a rejected message and accepts the whole emoji', async () => {
      await send('m3', `broken ${LONE_HIGH}`);
      expect(await prisma.message.count()).toBe(0);

      const ok = await send('m4', 'whole 😀 emoji');
      expect(ok.status).toBe(201);
      expect(ok.body.body).toBe('whole 😀 emoji');
    });
  });
});

describe('body-parser failures keep the error envelope and a correct status', () => {
  it('answers 413 for a body over the size limit, not 500', async () => {
    const huge = `{"identifier":"${'a'.repeat(2 * 1024 * 1024)}","password":"x"}`;
    const res = await postRaw('/api/auth/login', huge);
    expectEnvelope(res, 413, 'VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/too large/i);
  });

  it('answers 415 for a content-encoding the server cannot decode', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'br')
      .send('{"identifier":"a","password":"b"}');
    expectEnvelope(res, 415, 'VALIDATION_ERROR');
  });

  it('still answers 400 for malformed JSON', async () => {
    expectEnvelope(await postRaw('/api/auth/login', '{"identifier":'), 400, 'VALIDATION_ERROR');
  });

  it('answers 400 for an undecodable percent-escape in the path', async () => {
    const a = await registerUser(app, { username: 'pathUser' });
    const res = await request(app)
      .get('/api/conversations/%E0%A4%A/messages')
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never answers a user-search query containing a NUL byte with a 500', async () => {
    const a = await registerUser(app, { username: 'queryUser' });
    const res = await request(app)
      .get('/api/users/search')
      .query({ q: 'ab\u0000c' })
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(res.status).toBeLessThan(500);
  });
});
