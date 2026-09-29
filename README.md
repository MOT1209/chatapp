# ChatApp

A real-time chat application. Two-person build: one Backend/Infrastructure developer, one Frontend/UI developer.

**Status: Alpha v0.0.1.** Not production-ready — no deployment infrastructure, no
email delivery, no load testing. It is the first version where a full
register → search → chat → realtime flow actually works end to end.

## What Alpha v0.0.1 delivers

- Flutter client for Android, iOS, Windows, macOS, Linux and Web (`app/`):
  login, register, forgot/reset password, conversation list with people search,
  chat with optimistic send and retry, realtime messages, typing indicator,
  read receipts, message deletion, profile editing, dark mode, and an
  Arabic (right-to-left) and English UI. Responsive: bottom navigation on
  phones; navigation rail + sidebar + chat area on tablets and desktops.
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
password reset (the token is logged to the console in development only, and
never logged, returned, or exposed at all in production — see
`docs/api-contract.md` §6.6).

## Architecture

```
chatapp/
├── app/                Flutter (Dart) client for mobile, desktop and web
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

- **Client** — Flutter 3.47 / Dart 3.13, Material 3, `provider`, `http`, `web_socket_channel`, `flutter_localizations` (Arabic + English, RTL), `flutter_secure_storage` on mobile.
- **Backend** — Node ≥ 20, Express 4, TypeScript 5.7, Prisma 5, PostgreSQL 14+, Zod, Helmet, CORS, JWT (`jsonwebtoken`), bcrypt (`bcryptjs`), `express-rate-limit`, `ws`.
- **CI** — GitHub Actions. Backend: typecheck, lint, tests against a Postgres service container, build. App: format, analyze, tests, and release builds for web, Android, Linux, Windows, macOS and iOS.

## Repository layout

See the tree above. Cross-workspace communication is defined by [`docs/api-contract.md`](docs/api-contract.md) only.

## Local setup

Full walk-through in [`docs/development.md`](docs/development.md). Short version:

```bash
git clone <repo-url>
cd chatapp

# Backend
cd backend && npm install && cp .env.example .env
#   edit .env — DATABASE_URL, JWT secrets
npm run prisma:generate && npm run prisma:migrate && cd ..

# App (needs the Flutter SDK)
cd app && flutter pub get && cd ..

# Optional: root scripts
npm install
npm run dev          # backend + Flutter web on http://localhost:5173 in parallel
```

Health check:

```bash
curl http://localhost:4000/health
# {"status":"ok","service":"chatapp-api"}
```

## Environment variables

### App (compile-time, `--dart-define`)

| Variable | Purpose |
| --- | --- |
| `API_URL` | REST base URL, default `http://localhost:4000` |
| `WS_URL` | WebSocket URL, default `ws://localhost:4000/ws` |

Example: `flutter run --dart-define=API_URL=http://10.0.2.2:4000 --dart-define=WS_URL=ws://10.0.2.2:4000/ws` (Android emulator).

### Backend (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` / `test` / `production` |
| `PORT` | HTTP port (default `4000`) |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | HMAC secret for access tokens. In production must be long, random, and distinct from `JWT_REFRESH_SECRET` — the server refuses to start otherwise. Short/placeholder values are fine in development and test |
| `JWT_REFRESH_SECRET` | HMAC secret for refresh tokens. Same production requirement as above |
| `JWT_ACCESS_TTL` | Access token TTL (default `15m`) |
| `JWT_REFRESH_TTL` | Refresh token TTL (default `30d`) |
| `BCRYPT_ROUNDS` | bcrypt cost factor for password hashing (default `10`) |

`.env` is ignored by git. Never commit real secrets.

## Development commands

Backend (`backend/`):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with reload |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Tests (needs Postgres, see `backend/README.md`) |

App (`app/`):

| Command | Purpose |
| --- | --- |
| `flutter run -d chrome --web-port 5173` | Run on web (port 5173 matches the backend's default `CORS_ORIGIN`) |
| `flutter run -d <device>` | Run on Android, iOS, Windows, macOS or Linux |
| `dart format --set-exit-if-changed lib test` | Format check |
| `flutter analyze` | Static analysis |
| `flutter test` | Unit and widget tests |
| `flutter build <web\|apk\|ios\|windows\|macos\|linux>` | Release build |

Root-level (both workspaces, needs the Flutter SDK on `PATH`):

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
  GitHub's `GET /repos/.../branches/main` API does not reliably reflect ruleset-based
  protection, so a `protected: false` reading there doesn't mean the ruleset is off;
  check Settings → Rules → Rulesets directly.
- Branch prefixes: `app/*`, `backend/*`, `feature/*`, `fix/*`, `chore/*`.
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
- **Post-Alpha.** Groups, file upload, presence for group chats, avatars, message editing, real email delivery, iOS CI build.
- **Later.** Voice messages, video calls, AI features, notifications.

## Documentation

- [`docs/api-contract.md`](docs/api-contract.md) — HTTP + WebSocket contract (source of truth).
- [`docs/architecture.md`](docs/architecture.md) — system shape and boundaries.
- [`docs/development.md`](docs/development.md) — setup and daily commands.
- [`docs/git-workflow.md`](docs/git-workflow.md) — branches, commits, reviews.
- [`docs/ui-plan.md`](docs/ui-plan.md) — Flutter client architecture.
- [`app/README.md`](app/README.md) — running and testing the client.
