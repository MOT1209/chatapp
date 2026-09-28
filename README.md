# chatapp

A real-time chat application. Frontend (React + TypeScript + Vite) and Backend (Node + Express + Prisma + PostgreSQL), built by a team of two.

## Repository layout

```
chatapps/
├── docs/
│   ├── api-contract.md   ← the HTTP + WebSocket contract (source of truth for both sides)
│   └── ui-plan.md        ← UI architecture, design system and responsive rules
└── frontend/             ← React app (this repo tracks the frontend)
```

## Stack

**Frontend** — React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4, TanStack Query, React Router 7, Zod, Zustand, RTL Arabic-first UI.

**Backend** — Node, Express, TypeScript, Prisma, PostgreSQL, JWT (access + refresh), Zod, `ws` WebSocket server.

## Getting started

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend expects the API and WebSocket server described in [`docs/api-contract.md`](docs/api-contract.md).

### Environment

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL for the REST API, e.g. `http://localhost:4000` |
| `VITE_WS_URL` | WebSocket endpoint, e.g. `ws://localhost:4000/ws` |

## Scripts

Run from `frontend/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check then build for production |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript only, no emit |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |

## Conventions

- `src/lib/` holds infrastructure only and never imports React.
- `src/features/` holds one folder per domain. Features do not import each other.
- `src/components/` holds shared presentational components with no domain knowledge.
- Tailwind is the only styling system. No CSS modules, no inline style objects.
- Layout uses CSS logical properties (`ms-*`, `pe-*`, `start-*`, `end-*`) so RTL and LTR both work from one stylesheet.
"# chatapp" 
