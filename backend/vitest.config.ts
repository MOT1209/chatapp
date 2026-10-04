import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // Tests share one Postgres database and reset it between each test, so they
    // must not run concurrently against it.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // dotenv (loaded by src/config/env.ts) never overrides an already-set var, so
    // these values win regardless of what a developer's own backend/.env holds.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/chatapp_test?schema=public',
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      CORS_ORIGIN: 'http://localhost:5173',
      // Tests drive password reset back-to-back (e.g. supersession), so the
      // production cooldown is disabled here. tests/password-reset-mail.test.ts
      // re-enables it explicitly for the cases that are about the cooldown.
      PASSWORD_RESET_COOLDOWN_SECONDS: '0',
    },
  },
});
