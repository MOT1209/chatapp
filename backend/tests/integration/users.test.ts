import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser } from '../helpers/harness.js';

describe('GET /api/users/search', () => {
  it('finds by username and display name, excludes self, and hides emails', async () => {
    const { app } = makeApp();
    const me = await registerUser(app, { username: 'searcher', email: 'searcher@example.com', displayName: 'Searcher' });
    await registerUser(app, { username: 'sara', email: 'sara@example.com', displayName: 'Sara Ali' });
    await registerUser(app, { username: 'other', email: 'other@example.com', displayName: 'Nobody' });

    const res = await request(app).get('/api/users/search?q=sar&limit=20').set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    const usernames = res.body.users.map((u: { username: string }) => u.username);
    expect(usernames).toContain('sara');
    expect(usernames).not.toContain('searcher'); // self excluded
    for (const u of res.body.users) {
      expect(u).not.toHaveProperty('email');
    }
  });

  it('rejects a query shorter than 2 chars', async () => {
    const { app } = makeApp();
    const me = await registerUser(app);
    const res = await request(app).get('/api/users/search?q=a').set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns an empty list for no matches', async () => {
    const { app } = makeApp();
    const me = await registerUser(app);
    const res = await request(app).get('/api/users/search?q=zzzznomatch').set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('tolerates special characters without error', async () => {
    const { app } = makeApp();
    const me = await registerUser(app);
    const res = await request(app)
      .get(`/api/users/search?q=${encodeURIComponent('%_[]()')}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('requires authentication', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/users/search?q=sara');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/users/:id', () => {
  it('returns a user or 404', async () => {
    const { app } = makeApp();
    const me = await registerUser(app);
    const other = await registerUser(app);

    const found = await request(app).get(`/api/users/${other.user.id}`).set('Authorization', `Bearer ${me.accessToken}`);
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(other.user.id);
    expect(found.body).not.toHaveProperty('email');

    const missing = await request(app).get('/api/users/does-not-exist').set('Authorization', `Bearer ${me.accessToken}`);
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/users/me', () => {
  it('updates the display name', async () => {
    const { app } = makeApp();
    const me = await registerUser(app);
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ displayName: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('New Name');
  });

  it('rejects an empty patch', async () => {
    const { app } = makeApp();
    const me = await registerUser(app);
    const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${me.accessToken}`).send({});
    expect(res.status).toBe(400);
  });

  it('rejects a non-http avatar url', async () => {
    const { app } = makeApp();
    const me = await registerUser(app);
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ avatarUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });
});
