# Architecture

**Status:** Alpha v0.0.1. The shape below is implemented, not just planned.

**Decided:** `app/` (Flutter) is the canonical client. `frontend/` (React) is
frozen, not deleted. Two build sessions for the same "Frontend Developer" role
ran without visibility into each other and produced two full implementations
of the same UI. The Alpha spec names the target platforms as *"Android, iOS,
Windows, macOS, Linux, Web"* — `frontend/` structurally cannot cover more than
the last one. See the note at the top of the root `README.md` for the full
reasoning and what "frozen" does and doesn't mean.

## High-level

```
┌───────────────┐        HTTPS/REST          ┌───────────────┐        SQL         ┌────────────┐
│  app/         │ ─────────────────────────▶│               │ ──────────────────▶│            │
│  Flutter      │◀────────── WSS ───────────│   Backend     │                    │ PostgreSQL │
│  (6 platforms,│                            │  (Express)    │◀──── Prisma ──────│            │
│   canonical)  │                            │               │                    │            │
└───────────────┘                            │               │                    │            │
┌───────────────┐                            │               │                    │            │
│  frontend/    │ ─────────────────────────▶│               │                    │            │
│  React (web,  │◀────────── WSS ───────────└───────────────┘                    └────────────┘
│   frozen)     │
└───────────────┘
```

- **`app/`** (canonical): Flutter client — Android, iOS, Windows, macOS, Linux, Web. Independent codebase, independent build tooling (not npm). This is where new frontend work goes.
- **`frontend/`** (frozen): React 19 SPA served by Vite in dev, static assets in production. Web only. Still builds, still tested by CI, not receiving new features.
- **Backend**: Node/Express HTTP API + `ws` WebSocket server, both on the same HTTP server/port. Has no knowledge of which frontend is calling it.
- **Database**: PostgreSQL via Prisma. Migrations in `backend/prisma/migrations/`.
- **Contract**: [`api-contract.md`](./api-contract.md) is the single source of truth between all workspaces — both frontends and the backend.

## Repository shape

```
chatapp/
├── app/                 Flutter (Android, iOS, Windows, macOS, Linux, Web) — canonical
├── backend/             Node + Express + TypeScript + Prisma
├── frontend/            React + TypeScript + Vite (web only, frozen)
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
