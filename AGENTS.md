# AGENTS.md

Guidance for AI coding agents (and new human contributors) working in this
repository. This is the canonical agent guide; `CLAUDE.md` points here.

## What this project is

ChatApp — a real-time chat application. A monorepo with two independent
workspaces that talk to each other **only** through the HTTP + WebSocket
contract in [`docs/api-contract.md`](docs/api-contract.md):

- `app/` — Flutter (Dart) client for Android, iOS, Windows, macOS, Linux and Web.
- `backend/` — Node + Express + TypeScript + Prisma + PostgreSQL API, serving
  REST and a `ws` WebSocket server on the same port.

Status: **v0.0.2-beta** (Alpha stabilization + Phase 1 hardening). Not
production-ready: no deployment infra, no load testing. The register → search →
chat → realtime flow works end to end for two independent accounts.

```
chatapps/
├── app/        Flutter client (THE client)
├── backend/    Node/Express/TypeScript/Prisma API
├── docs/       contract (source of truth) + architecture/dev/git guides
├── scripts/    release-artifact + URL validators (Node --test)
├── frontend/   LEGACY stub (only dist/ + node_modules) — not the active client, do not build on it
├── package.json  monorepo scripts
├── plan.md · CHANGELOG.md · README.md
```

## Golden rules

1. **The contract is law.** `docs/api-contract.md` is the single source of truth
   between `app/` and `backend/`. Any change to request/response/frame shapes,
   error codes, or the DB schema that the client sees **must update that doc in
   the same change**. Never let code and contract diverge.
2. **Stay in your workspace.** The client never imports from `backend/` and vice
   versa. Cross-workspace knowledge lives only in `docs/api-contract.md`.
3. **The active client is `app/`, not `frontend/`.** `frontend/` is a stale stub.
4. **Never commit secrets.** `.env` is git-ignored. Don't add real secrets,
   tokens, or credentials to tracked files, logs, or error messages.
5. **Small, single-purpose PRs** against a branch — `main` is protected (no
   direct pushes). CI must be green before merge.

## Commands

Run from the repo root unless noted. Root scripts need the Flutter SDK on `PATH`.

| Task | Root (both workspaces) | Backend only (`backend/`) | App only (`app/`) |
| --- | --- | --- | --- |
| Dev | `npm run dev` (parallel) | `npm run dev` | `flutter run -d chrome --web-port 5173` |
| Build | `npm run build` | `npm run build` | `flutter build web --release` |
| Test | `npm test` | `npm test` (needs Postgres — see below) | `flutter test` |
| Lint | `npm run lint` | `npm run lint` (ESLint) | `flutter analyze` |
| Typecheck | `npm run typecheck` | `npm run typecheck` (tsc --noEmit) | `flutter analyze` |

Backend extras: `npm run prisma:generate`, `npm run prisma:migrate`,
`npm run cleanup` (bounded session/reset-token maintenance; `-- --dry-run` to preview).

Web dev port is **5173** on purpose — it matches the backend's default
`CORS_ORIGIN`.

## Before you call a change done

- Backend: `npm run typecheck && npm run lint && npm test` all green.
- App: `dart format --set-exit-if-changed lib test`, `flutter analyze`,
  `flutter test` all green.
- If you touched anything cross-workspace, confirm `docs/api-contract.md` matches.

## Backend conventions (`backend/src/`)

Strict layering — respect it:

- `routes/` — mount routers under `/api`, wire middleware, **no business logic**.
- `controllers/` — thin: parse the request, delegate, render the response.
- `services/` — business logic and **all** Prisma queries live here.
- `validators/` — Zod schemas; the **only** input boundary. A body, query, or WS
  frame is untrusted until it passes a schema here.
- `middleware/` — auth, validation, rate limit, request context, error handling,
  security headers.
- `realtime/` — `ws-server.ts` (WebSocket server) + `ws-hub.ts` (in-memory
  presence/connection hub). Services push frames through the hub; routes never
  talk to sockets directly.
- `lib/` — infrastructure only (prisma client, jwt, password, errors, logger,
  opaque cursor codec, cookies, CSRF). No route or realtime logic.
- `config/` — `env.ts` (one Zod schema validates all config; a bad value stops
  boot rather than falling back to an unsafe default) + `secrets.ts` (`*_FILE`
  secret-mount loading).
- `scripts/` — operational CLIs (e.g. `cleanup.ts`), kept off the HTTP path.

Backend specifics to keep in mind:

- ESM (`"type": "module"`), TypeScript 5.7, Node ≥ 20.
- Every response carries `X-Request-Id`, echoed into that request's structured
  logs. Preserve this when adding handlers.
- The error handler never leaks stack traces, raw messages, or internal detail —
  unexpected errors become a generic `SERVER_ERROR`; real detail goes only to the
  logger. Match the error envelope in `docs/api-contract.md` exactly.
- There is **no backend formatter** (ESLint only). Don't add Prettier in an
  unrelated change.

## Database (Prisma / PostgreSQL)

- Schema: `backend/prisma/schema.prisma`; migrations in
  `backend/prisma/migrations/`. Models: `User`, `Conversation`,
  `ConversationMember`, `Message`, `Session`, `PasswordResetToken`.
- Idempotency is baked into the schema and must stay that way:
  `Message @@unique([senderId, clientId])` (retried send returns the original
  row), `Conversation.directKey @unique` (1:1 conversation creation is
  idempotent). Don't break these without updating the contract.
- Refresh tokens and reset tokens are stored only as SHA-256 hashes — never the
  raw value.
- Any schema change that the client observes updates `docs/api-contract.md` too.

## Backend tests

Tests run against a **real** Postgres database (not mocks) — the Prisma queries
are part of what's verified. One-time setup:

```bash
createdb chatapp_test
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chatapp_test?schema=public" \
  npx prisma migrate deploy
cd backend && npm test
```

`vitest.config.ts` pins tests to `chatapp_test` on `localhost:5432` regardless of
your `.env`. Single worker, DB reset between tests (`tests/helpers/db.ts`).
`NODE_ENV=test` disables rate limiters and relaxes secret checks, so startup
**refuses** `NODE_ENV=test` against a non-loopback `DATABASE_URL`.

## App conventions (`app/lib/`)

- `core/` — `api_client`, `chat_api`, `realtime_client`, `token_storage`,
  `config`, platform-split HTTP client factory (`*_native.dart` / `*_web.dart`).
- `models/` — `user`, `conversation`, `message`.
- `state/` — `provider`-based controllers (`session`, `conversations`, `chat`,
  `people_search`, `settings`).
- `ui/screens/`, `ui/components/`, `ui/design/` (tokens, colors, typography,
  theme) — Material 3, responsive (bottom nav on phones; rail + sidebar + chat
  on tablet/desktop).
- `l10n/` — Arabic (RTL) + English localization. Add new user-facing strings to
  the `.arb` files, not inline literals.
- Flutter 3 / Dart 3 (`sdk: ^3.8.0`). Format is enforced in CI
  (`dart format --set-exit-if-changed`).
- Server URLs are compile-time via `--dart-define`: `API_URL`
  (default `http://localhost:4000`), `WS_URL` (default `ws://localhost:4000/ws`).

## WebSocket protocol (quick reference)

Endpoint `ws://<host>/ws`. First frame **must** be
`{"type":"auth","payload":{"token":"<accessToken>"}}`. Every frame is Zod-validated
(`realtime.validators.ts`); unknown/malformed frames get a `VALIDATION_ERROR` and
the connection stays open; frames over 16KB are rejected at the transport.
`typing`/`read` frames are authorization-checked against real conversation
membership. Sockets close with `4401` when the access token expires, and are
force-closed on logout/password-reset. Full frame protocol: `docs/api-contract.md` §4.

## Security posture (Alpha-level — see backend/README.md for the full list)

bcrypt password hashing; short-lived access JWTs + rotated opaque refresh tokens
(hash-only storage); production startup rejects weak/placeholder/identical JWT
secrets, non-https `APP_BASE_URL`, missing SMTP, and wildcard `CORS_ORIGIN`;
web clients keep the refresh token in an `HttpOnly` cookie guarded by an
`X-CSRF-Token` HMAC; explicit deny-all CSP + HSTS. Keep these invariants intact.

## Git workflow

Conventional-commit style (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`,
`ci:`). Branch prefixes: `app/*`, `backend/*`, `feature/*`, `fix/*`, `chore/*`.
Every change is a PR; CI green before merge; fill the PR template; contract
changes ride in the same PR. Full rules: [`docs/git-workflow.md`](docs/git-workflow.md).

## Key documentation

- [`docs/api-contract.md`](docs/api-contract.md) — HTTP + WebSocket contract (**source of truth**).
- [`docs/architecture.md`](docs/architecture.md) — system shape, boundaries, trade-offs.
- [`docs/development.md`](docs/development.md) — setup and daily commands.
- [`docs/ui-plan.md`](docs/ui-plan.md) — Flutter client architecture.
- [`docs/PHASE1_AUDIT.md`](docs/PHASE1_AUDIT.md) — what was broken/fixed/open.
- [`backend/README.md`](backend/README.md) · [`app/README.md`](app/README.md) · [`README.md`](README.md) · [`CHANGELOG.md`](CHANGELOG.md).
