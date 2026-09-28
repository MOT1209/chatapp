import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';

export function buildTestApp(): Express {
  return createApp();
}

export type AuthedUser = {
  user: { id: string; username: string; email: string; displayName: string };
  accessToken: string;
  refreshToken: string;
};

let counter = 0;

/** Registers a fresh, unique user and returns their tokens. */
export async function registerUser(
  app: Express,
  overrides: Partial<{ username: string; email: string; password: string; displayName: string }> = {},
): Promise<AuthedUser> {
  counter += 1;
  const n = counter;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      username: overrides.username ?? `user${n}`,
      email: overrides.email ?? `user${n}@example.com`,
      password: overrides.password ?? 'correct-horse-battery',
      displayName: overrides.displayName ?? `User ${n}`,
    });
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as AuthedUser;
}
