# ChatApp

A real-time chat application. Two-person build: one Backend/Infrastructure developer, one Frontend/UI developer.

**Status: Alpha v0.0.1.** Not production-ready — no deployment infrastructure, no
email delivery, no load testing. It is the first version where a full
register → search → chat → realtime flow actually works end to end.

## What Alpha v0.0.1 delivers

- Working React frontend (unchanged in this phase).
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
  both workspaces, PR/issue templates.

Explicitly **not** in Alpha v0.0.1: groups, file sharing, voice messages, video
calls, AI features, notifications, message editing, real email delivery for
password reset (the token is logged to the console instead — see
`docs/api-contract.md` §6.6).

## Architecture

```
chatapp/
├── frontend/           React + TypeScript + Vite + Tailwind
├── backend/            Node + Express + TypeScript + Prisma + PostgreSQL
├── docs/               contract, architecture, development, git workflow, UI plan
├── .github/            workflows, PR + issue templates
├── .gitignore
├── package.json        monorepo scripts
├── plan.md
└── README.md
```

See [`docs/architecture.md`](docs/architecture.md).

## Tech stack

- **Frontend** — React 19, TypeScript 5.9, Vite 8, Tailwind 4, TanStack Query 5, React Router 7, Zod, Zustand, RTL Arabic-first UI.
- **Backend** — Node ≥ 20, Express 4, TypeScript 5.7, Prisma 5, PostgreSQL 14+, Zod, Helmet, CORS, JWT (`jsonwebtoken`), bcrypt (`bcryptjs`), `express-rate-limit`, `ws`.
- **CI** — GitHub Actions (typecheck, lint, tests, build; backend adds Prisma validate + migrate deploy + Postgres service container).

## Repository layout

See the tree above. Cross-workspace communication is defined by [`docs/api-contract.md`](docs/api-contract.md) only.

## Local setup

Full walk-through in [`docs/development.md`](docs/development.md). Short version:

```bash
git clone <repo-url>
cd chatapp

# Frontend
cd frontend && npm install && cp .env.example .env && cd ..

# Backend
cd backend && npm install && cp .env.example .env
#   edit .env — DATABASE_URL, JWT secrets
npm run prisma:generate && npm run prisma:migrate && cd ..

# Optional: install root monorepo scripts
npm install
npm run dev          # runs frontend and backend in parallel
```

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

- `main` is protected — no direct pushes.
- Branch prefixes: `frontend/*`, `backend/*`, `feature/*`, `fix/*`, `chore/*`.
- Every change opens a PR; CI must be green before merge.
- Contract changes update `docs/api-contract.md` in the same PR.
- Never commit `.env` or any secret.

## Contribution rules

- Stay in your workspace unless the PR is explicitly cross-cutting.
- Follow the code owner conventions in `docs/architecture.md` and `docs/ui-plan.md`.
- Small, single-purpose PRs. Split large ones.
- Fill in the PR template completely.

## Roadmap

- **Phase 0 — Foundation.** ✅ Scaffolding, docs, CI, contract.
- **Alpha v0.0.1 (this).** ✅ Authentication → users → conversations → messages → realtime. First working E2E flow.
- **Post-Alpha.** Groups, file upload, presence for group chats, avatars, message editing, real email delivery.
- **Later.** Voice messages, video calls, AI features, notifications.

## Documentation

- [`docs/api-contract.md`](docs/api-contract.md) — HTTP + WebSocket contract (source of truth).
- [`docs/architecture.md`](docs/architecture.md) — system shape and boundaries.
- [`docs/development.md`](docs/development.md) — setup and daily commands.
- [`docs/git-workflow.md`](docs/git-workflow.md) — branches, commits, reviews.
- [`docs/ui-plan.md`](docs/ui-plan.md) — frontend architecture (placeholder in Phase 0).
