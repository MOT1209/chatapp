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

describe('GET /api/users/me', () => {
  it('returns the current user including email', async () => {
    const { accessToken, user } = await registerUser(app, { username: 'me1', email: 'me1@example.com' });
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.email).toBe('me1@example.com');
  });
});

describe('GET /api/users/search', () => {
  it('treats % and _ in the query literally, not as wildcards', async () => {
    const me = await registerUser(app, { username: 'wildme' });
    await registerUser(app, { username: 'abcdef' });
    await registerUser(app, { username: 'a_c.real' });

    const search = (q: string) =>
      request(app).get('/api/users/search').query({ q }).set('Authorization', `Bearer ${me.accessToken}`);

    expect((await search('a%f')).body.users).toHaveLength(0);
    const underscore = (await search('a_c')).body.users as { username: string }[];
    expect(underscore.map((u) => u.username)).toEqual(['a_c.real']);
  });

  it('finds users by username or display name, excludes self and email', async () => {
    const me = await registerUser(app, { username: 'searcher', email: 'searcher@example.com' });
    await registerUser(app, { username: 'sara', displayName: 'Sara H.', email: 'sara@example.com' });
    await registerUser(app, { username: 'unrelated', displayName: 'Someone Else', email: 'unrelated@example.com' });

    const res = await request(app)
      .get('/api/users/search')
      .query({ q: 'sara' })
      .set('Authorization', `Bearer ${me.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].username).toBe('sara');
    expect(res.body.users[0].email).toBeUndefined();
  });

  it('excludes the current user from results even on a self-matching query', async () => {
    const me = await registerUser(app, { username: 'selfsearch', email: 'selfsearch@example.com' });
    const res = await request(app)
      .get('/api/users/search')
      .query({ q: 'selfsearch' })
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.body.users).toHaveLength(0);
  });

  it('rejects a query shorter than 2 chars', async () => {
    const me = await registerUser(app);
    const res = await request(app)
      .get('/api/users/search')
      .query({ q: 'a' })
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/users/:id', () => {
  it('returns a public user without email', async () => {
    const me = await registerUser(app);
    const other = await registerUser(app, { username: 'viewed', email: 'viewed@example.com' });

    const res = await request(app)
      .get(`/api/users/${other.user.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('viewed');
    expect(res.body.email).toBeUndefined();
  });

  it('returns NOT_FOUND for an unknown id', async () => {
    const me = await registerUser(app);
    const res = await request(app)
      .get('/api/users/does-not-exist')
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/users/me', () => {
  it('updates displayName and avatarUrl', async () => {
    const me = await registerUser(app);
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ displayName: 'New Name', avatarUrl: 'https://example.com/a.png' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('New Name');
    expect(res.body.avatarUrl).toBe('https://example.com/a.png');
  });

  it('clears avatarUrl with null', async () => {
    const me = await registerUser(app);
    await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ avatarUrl: 'https://example.com/a.png' });

    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ avatarUrl: null });

    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBeNull();
  });

  it('rejects an empty body', async () => {
    const me = await registerUser(app);
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
