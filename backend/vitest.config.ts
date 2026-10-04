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
    // These are integration tests: every case talks to a real Postgres over a real
    // HTTP stack, and a handful of them deliberately fire 8-25 concurrent requests
    // at one database. The default 5s budget was regularly exceeded on a loaded
    // machine, turning a race-condition test into a coin flip. This is a ceiling
    // for genuinely stuck tests, not an allowance to hide slow ones.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // dotenv (loaded by src/config/env.ts) never overrides an already-set var, so
    // these values win regardless of what a developer's own backend/.env holds.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/chatapp_test?schema=public',
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      CORS_ORIGIN: 'http://localhost:5173',
      // The minimum bcrypt cost. Production uses 10 (env.ts default), where a
      // single hash costs ~50-250ms; almost every test registers a user, so the
      // real cost made the suite both slow and near the per-test timeout. The cost
      // factor is a tuning knob, not behaviour under test — hashing, comparison
      // and the dummy-hash timing equalisation in auth.service are identical at
      // any cost. Anything that must assert the real cost reads env directly.
      BCRYPT_ROUNDS: '4',
      // Tests drive password reset back-to-back (e.g. supersession), so the
      // production cooldown is disabled here. tests/password-reset-mail.test.ts
      // re-enables it explicitly for the cases that are about the cooldown.
      PASSWORD_RESET_COOLDOWN_SECONDS: '0',
    },
  },
});
