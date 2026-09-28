# Architecture

**Status:** Alpha v0.0.1. The shape below is implemented, not just planned.

## High-level

```
┌──────────────┐        HTTPS/REST         ┌───────────────┐        SQL         ┌────────────┐
│              │ ─────────────────────────▶│               │ ──────────────────▶│            │
│   Frontend   │                            │   Backend     │                    │ PostgreSQL │
│  (Vite SPA)  │◀────────── WSS ───────────│  (Express)    │◀──── Prisma ──────│            │
│              │                            │               │                    │            │
└──────────────┘                            └───────────────┘                    └────────────┘
```

- **Frontend**: React 19 SPA served by Vite in dev, static assets in production.
- **Backend**: Node/Express HTTP API + `ws` WebSocket server, both on the same HTTP server/port.
- **Database**: PostgreSQL via Prisma. Migrations in `backend/prisma/migrations/`.
- **Contract**: [`api-contract.md`](./api-contract.md) is the single source of truth between the two workspaces.

## Repository shape

```
chatapp/
├── frontend/           React + TypeScript + Vite
├── backend/            Node + Express + TypeScript + Prisma
├── docs/               contract + guides
└── .github/            CI + templates
```

## Boundaries

- Frontend never imports from `backend/` and vice versa.
- Cross-workspace shared knowledge lives in `docs/api-contract.md`. Any change that breaks the contract must update it in the same PR.
- Backend `src/lib/` holds infrastructure (logger, prisma client, jwt/password helpers, error types). No route or realtime logic here.
- Backend `src/routes/` mounts routers under `/api` and wires middleware; handlers live in `src/controllers/`, business logic and Prisma queries live in `src/services/`.
- Backend `src/realtime/` owns the WebSocket server and the in-memory presence hub (`ws-hub.ts`). `src/services/message.service.ts` pushes frames through it directly rather than routes talking to sockets.

## Environments

| Environment | Frontend | Backend |
| --- | --- | --- |
| Local dev | Vite `:5173` | Express `:4000` |
| CI | Build + tests only | Build + tests + Postgres service container |
| Production | (TBD post-Alpha) | (TBD post-Alpha) |

## What is intentionally **not** here in Alpha v0.0.1

- Groups, file uploads, voice messages, video calls, AI features, notifications.
- Message editing (deletion is implemented — see `docs/api-contract.md` §3.4.1).
- Real email delivery (password reset tokens are logged, not emailed).
- Multi-instance realtime: `ws-hub.ts` is an in-memory `Map`, correct for one
  backend process. Scaling to multiple instances needs a shared layer (e.g.
  Redis pub/sub) behind the same interface.
- Deployment infrastructure, load testing, production secrets management.
