# ChatApp

A real-time chat application, built by two developers: one Backend/Infrastructure,
one Frontend/UI.

**Status: Alpha v0.0.1.** Not production-ready — no deployment infrastructure, no
email delivery, no load testing. It is the first version where a full
register → search → chat → realtime flow actually works end to end.

> **Decided: `app/` (Flutter) is the canonical client. `frontend/` (React) is
> frozen, not deleted.** Two independent build sessions ran against the same
> "Frontend Developer" role without seeing each other's work, producing two
> full implementations of the same chat UI. The call: this project's own spec
> names the target platforms as *"Android, iOS, Windows, macOS, Linux, Web"* —
> `app/README.md` describes itself in those exact words; `frontend/` can only
> ever cover the last one. That's not a style preference, it's the target
> platform list only one of the two can structurally satisfy.
>
> What "frozen" means in practice: `frontend/` stays in the repo, its CI keeps
> running so it doesn't silently rot, and nobody has deleted a single line of
> it. It does **not** get new features — new work targets `app/`. If someone
> with real product authority wants a dedicated web client alongside the
> Flutter app later (a legitimate strategy many chat products use — see
> WhatsApp Web, Telegram Web), `frontend/` is sitting there ready to be revived
> rather than rebuilt from scratch. This is a reversible call, made from the
> evidence in this repo, not an irreversible deletion — if it's wrong, undoing
> it costs nothing.

## What Alpha v0.0.1 delivers

- `app/` — the canonical client (Flutter, Android/iOS/Windows/macOS/Linux/Web).
  `frontend/` (React, web) also works and stays in the repo, frozen — see the
  note above.
- Full backend: authentication (register/login/refresh/logout/forgot-reset
  password), user search and profiles, direct conversations, messages with
  idempotent send and cursor-paginated history, read receipts, basic message
  deletion, and realtime over WebSocket (new messages, typing, presence, read
  receipts).
- Prisma schema and migrations for `User`, `Conversation`, `ConversationMember`,
  `Message`, `Session`, `PasswordResetToken`.
- Input validation, rate limiting, and centralized error handling matching
  `docs/api-contract.md`'s error envelope exactly.
- 50+ backend tests (Vitest + Supertest + a real Postgres database), including
  a full WebSocket protocol test suite.
- Root monorepo scripts, GitHub Actions (Postgres service + migrations) for
  the backend and React frontend workspaces, a separate Flutter CI workflow,
  PR/issue templates.

Explicitly **not** in Alpha v0.0.1: groups, file sharing, voice messages, video
calls, AI features, notifications, message editing, real email delivery for
password reset (the token is logged to the console instead — see
`docs/api-contract.md` §6.6).

## Architecture

```
chatapp/
├── frontend/           React + TypeScript + Vite + Tailwind (web only, frozen)
├── app/                Flutter (Android, iOS, Windows, macOS, Linux, Web) — canonical client
├── backend/             Node + Express + TypeScript + Prisma + PostgreSQL
├── docs/                contract, architecture, development, git workflow, UI plan
├── .github/             workflows, PR + issue templates
├── .gitignore
├── package.json         monorepo scripts (frontend + backend only — app/ uses Flutter's own tooling)
├── plan.md
└── README.md
```

See [`docs/architecture.md`](docs/architecture.md).

## Tech stack

- **App (`app/`, canonical)** — Flutter (Dart SDK ^3.8), `http`, `web_socket_channel`, `shared_preferences`, `provider`, `uuid`, `intl`. See `app/README.md`.
- **Frontend (`frontend/`, frozen)** — React 19, TypeScript 5.9, Vite 8, Tailwind 4, TanStack Query 5, React Router 7, Zod, Zustand, RTL Arabic-first UI.
- **Backend** — Node ≥ 20, Express 4, TypeScript 5.7, Prisma 5, PostgreSQL 14+, Zod, Helmet, CORS, JWT (`jsonwebtoken`), bcrypt (`bcryptjs`), `express-rate-limit`, `ws`.
- **CI** — GitHub Actions: `frontend.yml`, `backend.yml` (typecheck, lint, tests, build; backend adds Prisma validate + migrate deploy + Postgres service container), `app.yml` (Flutter analyze/test/build).

## Repository layout

See the tree above. Cross-workspace communication is defined by [`docs/api-contract.md`](docs/api-contract.md) only.

## Local setup

Full walk-through in [`docs/development.md`](docs/development.md). Short version:

```bash
git clone <repo-url>
cd chatapp

# Backend (needed by both frontends)
cd backend && npm install && cp .env.example .env
#   edit .env — DATABASE_URL, JWT secrets
npm run prisma:generate && npm run prisma:migrate && cd ..

# React frontend
cd frontend && npm install && cp .env.example .env && cd ..

# Optional: install root monorepo scripts (frontend + backend only)
npm install
npm run dev          # runs frontend and backend in parallel
```

The Flutter app (`app/`) is separate — see [`app/README.md`](app/README.md). It's
not part of the root `npm run dev`/`build`/`test` scripts since it uses Flutter's
own tooling, not npm.

Health check:

```bash
curl http://localhost:4000/health
# {"status":"ok","service":"chatapp-api"}
```

## Environment variables

### Frontend (`frontend/.env`)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | REST base URL, e.g. `http://localhost:4000` |
| `VITE_WS_URL` | WebSocket URL, e.g. `ws://localhost:4000/ws` |

### Backend (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` / `test` / `production` |
| `PORT` | HTTP port (default `4000`) |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | HMAC secret for access tokens (Alpha) |
| `JWT_REFRESH_SECRET` | HMAC secret for refresh tokens (Alpha) |
| `JWT_ACCESS_TTL` | Access token TTL (default `15m`) |
| `JWT_REFRESH_TTL` | Refresh token TTL (default `30d`) |
| `BCRYPT_ROUNDS` | bcrypt cost factor for password hashing (default `10`) |

`.env` is ignored by git. Never commit real secrets.

### App (`app/`)

No `.env` file — Flutter uses compile-time `--dart-define` flags instead
(`API_URL`, `WS_URL`). See [`app/README.md`](app/README.md).

## Development commands

Run from a workspace directory (`frontend/` or `backend/`):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with reload |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |

Root-level (both workspaces):

```bash
npm run dev         # both dev servers in parallel
npm run build       # both builds sequentially
npm run test        # both test suites
npm run lint        # both linters
npm run typecheck   # both typecheckers
```

## Git workflow

Full rules in [`docs/git-workflow.md`](docs/git-workflow.md). Summary:

- `main` is protected — no direct pushes. Enforced via a GitHub **Ruleset**
  (Settings → Rules → Rulesets), not the classic Branch protection rules page.
  Note for whoever checks this next: GitHub's `GET /repos/.../branches/main`
  API — what an automated check would naturally look at — does not reliably
  reflect ruleset-based protection the way it reflects classic rules, so a
  `protected: false` reading from that endpoint alone doesn't mean the ruleset
  isn't working. Confirm actual enforcement at Settings → Rules → Rulesets
  directly, or by observing a real push/PR get blocked.
- Branch prefixes: `app/*`, `backend/*`, `frontend/*` (fixes only — see the canonical-client note above), `feature/*`, `fix/*`, `chore/*`.
- Every change opens a PR; CI must be green before merge.
- Contract changes update `docs/api-contract.md` in the same PR.
- Never commit `.env` or any secret.

## Contribution rules

- Stay in your workspace (`frontend/`, `app/`, or `backend/`) unless the PR is
  explicitly cross-cutting.
- Follow the code owner conventions in `docs/architecture.md` and `docs/ui-plan.md`.
- Small, single-purpose PRs. Split large ones.
- Fill in the PR template completely.

## Roadmap

- **Phase 0 — Foundation.** ✅ Scaffolding, docs, CI, contract.
- **Alpha v0.0.1 (this).** ✅ Authentication → users → conversations → messages → realtime. First working E2E flow, verified on `app/` (canonical) and `frontend/` (frozen).
- **Post-Alpha.** Groups, file upload, presence for group chats, avatars, message editing, real email delivery. Targets `app/`.
- **Later.** Voice messages, video calls, AI features, notifications.

## Documentation

- [`docs/api-contract.md`](docs/api-contract.md) — HTTP + WebSocket contract (source of truth).
- [`docs/architecture.md`](docs/architecture.md) — system shape and boundaries.
- [`docs/development.md`](docs/development.md) — setup and daily commands.
- [`docs/git-workflow.md`](docs/git-workflow.md) — branches, commits, reviews.
- [`docs/ui-plan.md`](docs/ui-plan.md) — frontend architecture (placeholder in Phase 0).
