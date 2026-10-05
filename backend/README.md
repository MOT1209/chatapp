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
rate-limit enforcement. `tests/e2e.test.ts` chains all of the above into one
continuous two-user journey — register, search, create a conversation, send,
receive live, type, read, go offline/online, reply, receive the reply live —
the closest this test suite gets to proving the actual release goal rather
than just its individual pieces.

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
  expiry, resetting invalidates every existing session.
- **Password reset is delivered by email.** SMTP is configured in `.env` (see
  `.env.example`) and the link is built from `APP_BASE_URL`, which must be
  `https://` in production. Outside production the API starts without SMTP and
  sends no mail, which keeps local dev and tests free of a mail dependency.
  **In production SMTP is mandatory — the process refuses to start without it**,
  because a reset flow with nowhere to send the token cannot complete.
- The raw reset token is never returned over HTTP, never logged, and never
  included in an email error log. A send that fails is logged by error type only
  (the provider's message can embed credentials) and the endpoint still answers
  `202`, so a bounce can't become a 500 that reveals whether an address exists.
  Outside production the service function also returns the token so tests can
  read it (`canExposeRawResetToken` in `auth.service.ts`).
- **`forgot-password` has a per-account cooldown** (`PASSWORD_RESET_COOLDOWN_SECONDS`,
  default 300s). Inside the window the request is silently ignored and mints no
  token, so no unusable link is created and one abuser cannot lock out another
  account. Unknown addresses send no mail at all.
- **Web clients keep the refresh token in an `HttpOnly` cookie**, so JavaScript on
  the origin cannot read it — an XSS or a compromised dependency cannot exfiltrate
  it. Because that cookie is ambient authority, the calls that rely on it must
  echo `X-CSRF-Token` (an HMAC of the refresh token), obtainable again from
  `GET /api/auth/csrf` after a reload. Native clients are unaffected and keep
  using the JSON body. See `docs/api-contract.md` §3.1.1.
- The cookie alone is not enough, because the token would still sit in the JSON body
  where any script on the page could read it. A browser therefore sends
  `X-Client-Platform: web` on register/login/refresh, and the server **omits**
  `refreshToken` from the response body. Without that header the token is returned
  exactly as before, so native builds need no change and a web client that forgets
  the header still ends up with a working cookie. See `docs/api-contract.md` §3.1.2.
- The cookie is `HttpOnly`, forced `Secure` in production, `SameSite=Lax` by
  default, and scoped to `Path=/api/auth`. `SameSite=None` additionally requires
  `Secure`, and a wildcard `CORS_ORIGIN` is rejected in production now that
  requests are credentialed.
- Security headers are set explicitly in `src/middleware/security-headers.ts`
  rather than left at Helmet's defaults: a deny-all CSP (including
  `frame-ancestors 'none'`), HSTS in production, and `require-corp`/`same-origin`
  COEP/COOP. `tests/security-headers.test.ts` asserts them on real responses.
- **Secrets can come from files.** `DATABASE_URL`, `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `SMTP_USER` and `SMTP_PASS` accept a `*_FILE` variant
  (`JWT_ACCESS_SECRET_FILE=/run/secrets/…`) read at startup via
  `src/config/secrets.ts`, for container and Kubernetes secret mounts. The list
  is an allowlist (`SECRET_ENV_NAMES`): unrelated `*_FILE` variables such as
  `SSL_CERT_FILE` are never read. One trailing newline is trimmed and the literal
  variable wins if both are set.
- `POST /auth/logout` revokes **every** session for the account, not just the
  caller's — see `docs/api-contract.md`'s logout section. A logout carrying a
  cookie without a valid CSRF token clears the cookie and returns `204` but
  revokes nothing, since the request is untrusted.
- Auth, user search, and message-send routes are rate limited
  (`src/middleware/rate-limit.ts`); disabled automatically when `NODE_ENV=test`
  (`tests/security.test.ts` verifies the real 429/`Retry-After`/`RATE_LIMITED`
  behavior against an isolated instance of the same limiter, bypassing that
  test-mode switch).
- CORS is restricted to `CORS_ORIGIN` (exact origins, comma-separated;
  `Access-Control-Allow-Credentials: true`, never a wildcard in production).
  Security headers are set per the `security-headers.ts` bullet above.
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

## Contract

The HTTP + WebSocket contract lives in [`../docs/api-contract.md`](../docs/api-contract.md).
This backend follows it exactly, with one additive, backward-compatible extension
(message deletion, §3.4.1) documented inline — see that file's revision notes.
Do not diverge from it further without updating the doc in the same change.
