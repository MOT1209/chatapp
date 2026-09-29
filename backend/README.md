# chatapp-backend

Node + Express + TypeScript + Prisma + PostgreSQL API for ChatApp.

**Status: Alpha v0.0.1.** Authentication, users, direct conversations, messages, and
realtime (WebSocket) are implemented, per [`../docs/api-contract.md`](../docs/api-contract.md).
Groups, file sharing, voice, video calls, AI, and message editing are explicitly out
of scope for this version.

## Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 14 running locally (or a `DATABASE_URL` you can reach)

## Setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env — DATABASE_URL, JWT secrets (openssl rand -base64 48)
npm run prisma:generate
npm run prisma:migrate       # applies migrations, creates one on first run if needed
npm run dev
```

Health check:

```bash
curl http://localhost:4000/health
# {"status":"ok","service":"chatapp-api"}
```

### Trying it end to end

```bash
# Register
curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"ahmad","email":"ahmad@example.com","password":"correct-horse-battery","displayName":"Ahmad"}'

# Use the returned accessToken for protected routes
curl -s http://localhost:4000/api/users/me -H "Authorization: Bearer <accessToken>"
```

WebSocket endpoint: `ws://localhost:4000/ws`. The first frame sent must be
`{"type":"auth","payload":{"token":"<accessToken>"}}` — see
[`../docs/api-contract.md`](../docs/api-contract.md) §4 for the full frame protocol.

## Testing

Tests run against a real PostgreSQL database (not mocks) — this is Alpha, and the
Prisma queries themselves are part of what's being verified.

```bash
# One-time: create a dedicated test database
createdb chatapp_test   # or: psql -c "CREATE DATABASE chatapp_test;"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chatapp_test?schema=public" \
  npx prisma migrate deploy

npm test
```

`vitest.config.ts` points tests at `chatapp_test` on `localhost:5432` regardless of
what your own `backend/.env` holds (dotenv never overrides an already-set variable,
and vitest sets these first) — see the comment there if you need a different setup
locally. Each test file resets the database between tests
(`tests/helpers/db.ts`); tests run in a single worker since they share one database.

Covers: register, login, session refresh/rotation, session expiry, logout
(including multi-session revocation), authentication middleware, user search,
profile update, conversation creation (including idempotency), message send
(including clientId de-duplication), cursor pagination, read receipts,
message deletion, and the full WebSocket protocol (auth handshake,
`message:new`, `typing`, `presence`, `read`, heartbeat) including its runtime
frame validation, authorization checks, and crash-safety (oversized frames,
malformed JSON, unknown types). A separate `tests/security.test.ts` covers
JWT secret strength validation, error-response sanitization, and real
rate-limit enforcement.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | tsx watch dev server |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Vitest (needs `chatapp_test`, see above) |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:migrate:deploy` | Apply existing migrations without prompting (CI/production) |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:studio` | Open Prisma Studio |

## Layout

```
backend/
├── src/
│   ├── config/           env parsing (Zod)
│   ├── middleware/       auth, validation, rate limiting, error handling
│   ├── routes/           HTTP route modules, mounted under /api
│   ├── controllers/      thin request/response handlers
│   ├── services/         business logic + Prisma queries
│   ├── validators/       Zod schemas per domain
│   ├── realtime/         WebSocket server + presence hub
│   ├── lib/              infra: prisma client, jwt, password hashing, errors, logger
│   ├── types/            shared TS types (Express augmentation, realtime frames)
│   ├── app.ts            Express factory
│   └── server.ts         entry point — boots HTTP + WebSocket
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── tests/
    ├── helpers/           test app + DB reset
    ├── auth.test.ts
    ├── users.test.ts
    ├── conversations.test.ts
    ├── messages.test.ts
    ├── realtime.test.ts
    └── health.test.ts
```

## Security notes (Alpha-level, not a production audit)

- Passwords hashed with bcrypt (`BCRYPT_ROUNDS`, default 10).
- Refresh tokens are opaque random strings; only their SHA-256 hash is stored
  (`Session.refreshHash`). Rotated on every use; the old token is dead the
  moment a new one is issued from it.
- Access tokens are short-lived JWTs (`JWT_ACCESS_TTL`, default 15m).
- **`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are validated at startup in
  production** (`src/config/env.ts`): too short, identical to each other, or
  a known placeholder (`secret`, `change-me`, `dev-secret`, …) and the process
  refuses to start. `development`/`test` allow short, obviously-fake values —
  see `.env.example`. Never logged.
- Password reset tokens: random, only their hash stored, single-use, 1-hour
  expiry, resetting invalidates every existing session. The raw token is
  environment-gated (`canExposeRawResetToken` in `auth.service.ts`) — logged
  in development, returned only to test code, **never logged, returned, or
  otherwise exposed in production** (no email provider is wired up yet — see
  `docs/api-contract.md` §6.6, and until one is, the token is unrecoverable
  once created, by design).
- `POST /auth/logout` revokes **every** session for the account, not just the
  caller's — see `docs/api-contract.md`'s logout section.
- Auth, user search, and message-send routes are rate limited
  (`src/middleware/rate-limit.ts`); disabled automatically when `NODE_ENV=test`
  (`tests/security.test.ts` verifies the real 429/`Retry-After`/`RATE_LIMITED`
  behavior against an isolated instance of the same limiter, bypassing that
  test-mode switch).
- CORS is restricted to `CORS_ORIGIN`; Helmet sets standard security headers.
- Every input is validated with Zod before it reaches a service — REST bodies
  and query params, and every WebSocket frame (`src/validators/realtime.validators.ts`):
  an unknown frame type, a missing or mistyped field, or malformed JSON is
  rejected with a `VALIDATION_ERROR` frame, connection kept alive. Frames over
  16KB are rejected at the transport level.
- WebSocket `typing`/`read` frames are authorization-checked against real
  conversation membership, not just a valid access token — a frame for a
  conversation the sender isn't in is dropped silently, no broadcast, no error
  frame, connection stays open.
- Both the WebSocket server and every individual socket have an `error`
  listener (`src/realtime/ws-server.ts`). Node's `EventEmitter` throws on an
  unhandled `'error'` event, so without these, one bad frame (or an oversized
  one hitting `maxPayload`) could crash the whole process and every other
  connection with it.
- A direct conversation's existence is not confirmed to a non-participant — accessing
  one you're not a member of returns `NOT_FOUND`, not `FORBIDDEN`.
- The error handler (`src/middleware/error-handler.ts`) never puts a stack
  trace, a raw error message, or any internal detail in an HTTP response —
  unexpected errors always become a generic `SERVER_ERROR`; the real detail
  goes only to the server-side logger.
- No email/SMTP integration yet — see `docs/api-contract.md` §6.6.

## Contract

The HTTP + WebSocket contract lives in [`../docs/api-contract.md`](../docs/api-contract.md).
This backend follows it exactly, with one additive, backward-compatible extension
(message deletion, §3.4.1) documented inline — see that file's revision notes.
Do not diverge from it further without updating the doc in the same change.
