# Development guide

## Prerequisites

- Node.js ≥ 20 (managed via `.nvmrc` if you use nvm)
- npm ≥ 10
- PostgreSQL ≥ 14 running locally (or a reachable `DATABASE_URL`)
- Git

## First-time setup

```bash
git clone <repo-url>
cd chatapp

# Frontend
cd frontend
npm install
cp .env.example .env
cd ..

# Backend
cd backend
npm install
cp .env.example .env
# edit .env — set DATABASE_URL, JWT secrets
npm run prisma:generate
npm run prisma:migrate   # creates initial migration
cd ..
```

## Running the app

Two terminals is the simplest path:

```bash
# terminal 1
cd frontend && npm run dev

# terminal 2
cd backend && npm run dev
```

Or from the repo root, if the monorepo scripts are installed:

```bash
npm install
npm run dev            # runs both in parallel
```

## Common commands

Run from the workspace directory (`frontend/` or `backend/`):

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with reload |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |

Backend adds Prisma commands: `prisma:migrate`, `prisma:generate`, `prisma:studio`.

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

**Never commit `.env`.** `.gitignore` already blocks it — double-check `git status` before every push.

## Verifying the setup

```bash
# Backend health check
curl http://localhost:4000/health
# → {"status":"ok","service":"chatapp-api"}

# Prisma schema is valid
cd backend && npx prisma validate
```

## Testing before pushing

Run all four in both workspaces:

```
npm run typecheck && npm run lint && npm test && npm run build
```

CI runs the same set. If it fails locally, it will fail there.
