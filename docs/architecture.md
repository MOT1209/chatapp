# Architecture

**Status:** v0.0.2-beta + Phase 1 hardening. The shape below is implemented, not just planned.

## High-level

```
┌──────────────┐        HTTPS/REST         ┌───────────────┐        SQL         ┌────────────┐
│              │ ─────────────────────────▶│               │ ──────────────────▶│            │
│   Client     │                            │   Backend     │                    │ PostgreSQL │
│  (Flutter)   │◀────────── WSS ───────────│  (Express)    │◀──── Prisma ──────│            │
│              │                            │               │                    │            │
└──────────────┘                            └───────────────┘                    └────────────┘
```

- **Client**: one Flutter codebase in `app/`, built for Android, iOS, Windows, macOS, Linux and Web. Web builds are static assets.
- **Backend**: Node/Express HTTP API + `ws` WebSocket server, both on the same HTTP server/port.
- **Database**: PostgreSQL via Prisma. Migrations in `backend/prisma/migrations/`.
- **Contract**: [`api-contract.md`](./api-contract.md) is the single source of truth between the two workspaces.

## Repository shape

```
chatapp/
├── app/                Flutter client
├── backend/            Node + Express + TypeScript + Prisma
│   └── src/
│       ├── routes/         mount routers, wire middleware, no logic
│       ├── controllers/    req/res only: parse, delegate, render
│       ├── services/       business logic and Prisma queries
│       ├── middleware/     auth, validation, rate limit, request context, errors
│       ├── validators/     Zod schemas — the only input boundary
│       ├── realtime/       WebSocket server + in-memory hub
│       ├── lib/            infrastructure (errors, logger, jwt, cursor, cookies)
│       ├── config/         env schema + secret-file loading
│       ├── scripts/        operational CLIs (maintenance job)
│       └── types/          shared types (realtime frames)
├── docs/               contract + guides
└── .github/            CI + templates
```

## Boundaries

- The client never imports from `backend/` and vice versa.
- Cross-workspace shared knowledge lives in `docs/api-contract.md`. Any change that breaks the contract must update it in the same PR.
- Backend `src/lib/` holds infrastructure (logger, prisma client, jwt/password helpers, error types, opaque cursor codec, cookie/CSRF helpers). No route or realtime logic here.
- Backend `src/routes/` mounts routers under `/api` and wires middleware; handlers live in `src/controllers/`, business logic and Prisma queries live in `src/services/`.
- Backend `src/validators/` owns every request boundary. A body, query or frame is untrusted until it passes a Zod schema there.
- Backend `src/realtime/` owns the WebSocket server and the in-memory presence hub (`ws-hub.ts`). `src/services/message.service.ts` pushes frames through it directly rather than routes talking to sockets.
- Backend `src/scripts/` holds operational CLIs, separate from the request path so a scheduled job cannot be reached over HTTP.

## Operational surfaces

| Surface | Route | Notes |
| --- | --- | --- |
| Liveness | `GET /health` | no database access; proves the process serves |
| Readiness | `GET /ready` | `SELECT 1`; 503 when PostgreSQL is unreachable |
| Maintenance | `npm run cleanup` | CLI only, never an HTTP route. Deletes expired/revoked sessions and expired/used reset tokens in bounded batches. Idempotent and safe on a live service |

Every request gets a `requestId` (echoed from a sane inbound `X-Request-Id`, else generated) which appears in the `X-Request-Id` response header and in that request's structured log lines, including unhandled errors.

## Environments

| Environment | Frontend | Backend |
| --- | --- | --- |
| Local dev | `flutter run` (web on `:5173`) | Express `:4000` |
| CI | Analyze + tests + release build per platform | Build + tests + Postgres service container |
| Production | (TBD post-Alpha) | (TBD post-Alpha) |

## Configuration and startup

All configuration is validated by a single Zod schema (`backend/src/config/env.ts`). A missing or malformed value stops the process with a named field error instead of booting into an unsafe default. `backend/.env.example` documents every variable with its default and whether it is required.

Production additionally refuses to start unless: both JWT secrets are long, non-placeholder and distinct; `APP_BASE_URL` is `https`; SMTP is fully configured; `CORS_ORIGIN` lists explicit origins (no wildcard). Any secret may instead be supplied as a `*_FILE` path so credentials stay out of environment dumps and process listings.

`NODE_ENV=test` disables the rate limiters and relaxes the secret checks. Because that combination would ship an API with no auth throttling, startup **refuses** `NODE_ENV=test` against a non-loopback `DATABASE_URL`.

`TRUST_PROXY` must state how many reverse proxies sit in front of the API, because every per-IP rate limiter keys on `req.ip`.

## What is intentionally **not** here yet

- Groups, file uploads, voice messages, video calls, AI features, notifications.
- Message editing (deletion is implemented — see `docs/api-contract.md` §3.4.1).
- Multi-instance realtime: `ws-hub.ts` is an in-memory `Map`, correct for one
  backend process. Scaling to multiple instances needs a shared layer (e.g.
  Redis pub/sub) behind the same interface.
- Deployment infrastructure, load testing.

## Known trade-offs

- **Registration reveals duplicates.** `POST /api/auth/register` answers `409` with per-field messages so the form can show them. This does let a caller probe which usernames/emails exist; login and forgot-password deliberately do not.
- **Access tokens outlive logout.** Logout and password reset revoke refresh sessions, but an already-issued access token stays valid until it expires (`JWT_ACCESS_TTL`, 15 minutes by default).
- **WebSocket connections are bound to their token.** A socket closes with code `4401` when its access token expires, and `wsHub.closeUser` closes a user's sockets on logout and on password reset — so a connection cannot outlive its credentials. This is *not* the same as the REST trade-off above: an access token already issued to a REST client remains usable until it expires, because there is no server-side session check on the REST path.
- **Rate limits are in-memory and per IP.** They reset on restart and are not shared between instances. There is still no per-*account* login limit (only per-IP), and no cap on concurrent WebSocket connections per user.
- **Presence is exposed to every authenticated user over REST.** `isOnline` and `lastSeenAt` are returned by `GET /users/:id` and by search, not just to conversation partners. The WebSocket presence broadcast *is* partner-scoped. Whether to narrow the REST side is an open decision that gates Phase 6 (privacy settings, blocking) — see `docs/DEVELOPMENT_AUDIT.md` F-16.
- **No backend formatter.** The backend is gated on ESLint only; there is no Prettier/`--check` step. The Flutter side does enforce `dart format --set-exit-if-changed`. Adding a backend formatter is deliberately deferred rather than mixed into the Phase 1 functional changes.
