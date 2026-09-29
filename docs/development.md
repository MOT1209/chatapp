# Development guide

## Prerequisites

- Node.js ≥ 20 (managed via `.nvmrc` if you use nvm)
- Flutter ≥ 3.47 (stable) for the client, plus the platform toolchain you target (Android SDK, Xcode, Visual Studio, or GTK dev libraries on Linux)
- npm ≥ 10
- PostgreSQL ≥ 14 running locally (or a reachable `DATABASE_URL`)
- Git

## First-time setup

```bash
git clone <repo-url>
cd chatapp

# Backend
cd backend
npm install
cp .env.example .env
# edit .env — set DATABASE_URL, JWT secrets
npm run prisma:generate
npm run prisma:migrate   # creates initial migration
cd ..

# App
cd app
flutter pub get
cd ..
```

## Running the app

Two terminals is the simplest path:

```bash
# terminal 1
cd backend && npm run dev

# terminal 2 — web on :5173 matches the backend's default CORS_ORIGIN
cd app && flutter run -d chrome --web-port 5173
```

Or from the repo root, if the monorepo scripts are installed:

```bash
npm install
npm run dev            # runs both in parallel
```

## Common commands

Backend, from `backend/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with reload |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |

Backend adds Prisma commands: `prisma:migrate`, `prisma:generate`, `prisma:studio`.

App, from `app/`: `flutter run`, `flutter analyze`, `flutter test`, `dart format lib test`,
`flutter build <platform>`. See [`app/README.md`](../app/README.md).

## Environment variables

### App (`--dart-define` at build/run time)

| Variable | Purpose |
| --- | --- |
| `API_URL` | REST base URL, default `http://localhost:4000` |
| `WS_URL` | WebSocket URL, default `ws://localhost:4000/ws` |

### Backend (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` / `test` / `production` |
| `PORT` | HTTP port (default `4000`) |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | HMAC secret for access tokens. Production rejects short values, known placeholders (`secret`, `change-me`, …), or a value identical to `JWT_REFRESH_SECRET` — the server won't start. development/test allow short, obviously-fake values |
| `JWT_REFRESH_SECRET` | HMAC secret for refresh tokens. Same production requirement as above |
| `JWT_ACCESS_TTL` | Access token TTL (default `15m`) |
| `JWT_REFRESH_TTL` | Refresh token TTL (default `30d`) |
| `BCRYPT_ROUNDS` | bcrypt cost factor for password hashing (default `10`) |

**Never commit `.env`.** `.gitignore` already blocks it — double-check `git status` before every push.

## Verifying the setup

```bash
# Backend health check
curl http://localhost:4000/health
# → {"status":"ok","service":"chatapp-api"}

# Prisma schema is valid
cd backend && npx prisma validate
```

## Backend tests need a second database

Backend tests run against a real PostgreSQL database, not mocks:

```bash
createdb chatapp_test   # or: psql -c "CREATE DATABASE chatapp_test;"
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chatapp_test?schema=public" \
  npx prisma migrate deploy
npm test
```

`backend/vitest.config.ts` points tests at `chatapp_test` regardless of your own
`.env` — see that file for details. CI creates this database automatically via a
Postgres service container.

## Testing before pushing

Backend:

```
npm run typecheck && npm run lint && npm test && npm run build
```

App:

```
dart format --set-exit-if-changed lib test && flutter analyze && flutter test
```

CI runs the same set. If it fails locally, it will fail there.
