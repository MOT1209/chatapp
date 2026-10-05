// CLI for `start-server.bat`: writes backend/.env for a first-time local setup.
//
//   PGPW=<postgres password> [LAN_IP=192.168.1.20] npx tsx src/scripts/setup-env.ts
//
// The password arrives in the environment, not argv, so it never shows up in a process
// listing. An existing .env is never overwritten: it may hold settings the user
// customised, and rewriting it on every run silently discarded them. Delete the file to
// regenerate it. Nothing secret is ever printed.

import { existsSync, writeFileSync } from 'node:fs';
import { buildLocalEnv } from './local-env.js';

const target = new URL('../../.env', import.meta.url);

if (existsSync(target)) {
  console.log('Keeping the existing .env (delete it to generate a new one).');
  process.exit(0);
}

try {
  const content = buildLocalEnv({
    dbPassword: process.env.PGPW ?? '',
    lanIp: process.env.LAN_IP?.trim() || undefined,
  });
  // 0600: the file holds the database password and the token-signing secrets.
  writeFileSync(target, content, { mode: 0o600 });
  console.log('Created .env with a dedicated "chatapp" database and fresh random token secrets.');
} catch (err) {
  console.error(err instanceof Error ? err.message : 'Could not create .env.');
  process.exit(1);
}
