# Architecture

**Status:** Phase 0 (foundation). This document describes the shape of the system as it will exist once Alpha v0.0.1 is built. Phase 0 only sets up the scaffolding.

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
- **Backend**: Node/Express HTTP API + WebSocket server (added in Alpha).
- **Database**: PostgreSQL via Prisma.
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
- Backend `src/lib/` holds infrastructure (logger, prisma client, jwt helpers). No HTTP or DB access from here except through documented interfaces.
- Backend `src/routes/` mounts routers; controllers/services will be added in Alpha.

## Environments

| Environment | Frontend | Backend |
| --- | --- | --- |
| Local dev | Vite `:5173` | Express `:4000` |
| CI | Build + tests only | Build + tests + Postgres service container |
| Production | (TBD post-Alpha) | (TBD post-Alpha) |

## What is intentionally **not** here in Phase 0

- Authentication logic (JWT signing, refresh flow).
- Message send/read/typing pipelines.
- WebSocket handlers.
- File uploads, calls, AI, groups, notifications.

These arrive with Alpha v0.0.1.
