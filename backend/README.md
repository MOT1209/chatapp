# chatapp-backend

Node + Express + TypeScript + Prisma + PostgreSQL API for ChatApp.

**Status: Phase 0 — foundation only.**
No authentication, no messaging, no realtime yet. Only `/health` and the Prisma schema.

## Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 14 running locally (or a `DATABASE_URL` you can reach)

## Setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env with your DATABASE_URL
npm run prisma:generate
npm run prisma:migrate       # creates the initial migration in dev
npm run dev
```

Health check:

```bash
curl http://localhost:4000/health
# {"status":"ok","service":"chatapp-api"}
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | tsx watch dev server |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:studio` | Open Prisma Studio |

## Layout

```
backend/
├── src/
│   ├── config/           env parsing (Zod)
│   ├── middleware/       shared HTTP middleware
│   ├── routes/           HTTP route modules
│   ├── controllers/      (reserved — Alpha)
│   ├── services/         (reserved — Alpha)
│   ├── lib/              infra (logger, prisma client, jwt, …)
│   ├── types/            shared TS types
│   ├── app.ts            Express factory
│   └── server.ts         entry point
├── prisma/
│   └── schema.prisma
└── tests/
```

## Contract

The HTTP + WebSocket contract lives in [`../docs/api-contract.md`](../docs/api-contract.md).
Do not diverge from it without updating the doc in the same PR.
