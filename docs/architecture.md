# Architecture

**Status:** Alpha v0.0.1. The shape below is implemented, not just planned.

**Open architectural question, unresolved as of this writing:** this repo has
*two* client implementations — `frontend/` (React, web) and `app/` (Flutter,
six platforms) — both built against the same contract, neither designated as
"the" product. That happened because two build sessions for the same "Frontend
Developer" role ran without visibility into each other. This document
describes both as they exist; it does not resolve which one the project
commits to. See the note at the top of the root `README.md`.

## High-level

```
┌───────────────┐                            ┌───────────────┐        SQL         ┌────────────┐
│  frontend/    │ ─────────────────────────▶│               │ ──────────────────▶│            │
│  React (web)  │                            │               │                    │            │
└───────────────┘◀────────── WSS ───────────│   Backend     │                    │ PostgreSQL │
                                              │  (Express)    │◀──── Prisma ──────│            │
┌───────────────┐        HTTPS/REST          │               │                    │            │
│  app/         │ ─────────────────────────▶│               │                    │            │
│  Flutter      │◀────────── WSS ───────────└───────────────┘                    └────────────┘
│  (6 platforms)│
└───────────────┘
```

- **`frontend/`**: React 19 SPA served by Vite in dev, static assets in production. Web only.
- **`app/`**: Flutter client — Android, iOS, Windows, macOS, Linux, Web. Same contract, independent codebase, independent build tooling (not npm).
- **Backend**: Node/Express HTTP API + `ws` WebSocket server, both on the same HTTP server/port. Has no knowledge of which frontend is calling it.
- **Database**: PostgreSQL via Prisma. Migrations in `backend/prisma/migrations/`.
- **Contract**: [`api-contract.md`](./api-contract.md) is the single source of truth between all workspaces — both frontends and the backend.

## Repository shape

```
chatapp/
├── frontend/           React + TypeScript + Vite (web)
├── app/                Flutter (Android, iOS, Windows, macOS, Linux, Web)
├── backend/            Node + Express + TypeScript + Prisma
├── docs/                contract + guides
└── .github/             CI + templates
```

## Boundaries

- No workspace imports from another. `frontend/` and `app/` do not share code with each other or with `backend/`.
- Cross-workspace shared knowledge lives in `docs/api-contract.md`. Any change that breaks the contract must update it in the same PR — this now binds three workspaces, not two.
- Backend `src/lib/` holds infrastructure (logger, prisma client, jwt/password helpers, error types). No route or realtime logic here.
- Backend `src/routes/` mounts routers under `/api` and wires middleware; handlers live in `src/controllers/`, business logic and Prisma queries live in `src/services/`.
- Backend `src/realtime/` owns the WebSocket server and the in-memory presence hub (`ws-hub.ts`). `src/services/message.service.ts` pushes frames through it directly rather than routes talking to sockets.

## Environments

| Environment | `frontend/` | `app/` | Backend |
| --- | --- | --- | --- |
| Local dev | Vite `:5173` | `flutter run` (device/emulator/chrome) | Express `:4000` |
| CI | Build + tests only | `flutter analyze`/`test`/build only | Build + tests + Postgres service container |
| Production | (TBD post-Alpha) | (TBD post-Alpha) | (TBD post-Alpha) |

## What is intentionally **not** here in Alpha v0.0.1

- Groups, file uploads, voice messages, video calls, AI features, notifications.
- Message editing (deletion is implemented — see `docs/api-contract.md` §3.4.1).
- Real email delivery (password reset tokens are logged, not emailed).
- Multi-instance realtime: `ws-hub.ts` is an in-memory `Map`, correct for one
  backend process. Scaling to multiple instances needs a shared layer (e.g.
  Redis pub/sub) behind the same interface.
- Deployment infrastructure, load testing, production secrets management.
