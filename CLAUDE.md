# CLAUDE.md

Guidance for Claude Code in this repository.

**The full agent guide lives in [`AGENTS.md`](AGENTS.md) — read it first.** It
covers the project layout, commands, backend/app conventions, the database and
WebSocket contract, security invariants, and the git workflow. Everything there
applies to Claude Code. This file only adds the essentials and a few
Claude-specific notes.

## TL;DR

- Monorepo: `app/` (Flutter client) + `backend/` (Node/Express/TypeScript/Prisma).
  They communicate **only** through [`docs/api-contract.md`](docs/api-contract.md),
  which is the source of truth — change code and contract together.
- The active client is `app/`. `frontend/` is a stale stub; ignore it.
- Strict backend layering: `routes → controllers → services → prisma`, with all
  input validated by Zod `validators/`. See [`AGENTS.md`](AGENTS.md).
- Never commit secrets; `.env` is git-ignored.

## Verify before reporting done

- Backend (`backend/`): `npm run typecheck && npm run lint && npm test`.
  Tests need a real Postgres `chatapp_test` DB — setup in [`AGENTS.md`](AGENTS.md)
  / `backend/README.md`. If you can't reach Postgres, say so plainly rather than
  claiming the suite passed.
- App (`app/`): `dart format --set-exit-if-changed lib test`, `flutter analyze`,
  `flutter test`.
- Touched anything cross-workspace? Confirm `docs/api-contract.md` matches.

## Environment notes

- Platform here is **Windows**; the primary shell is PowerShell, with a Bash tool
  also available (each needs its own syntax). Prefer the dedicated file/search
  tools over shell `cat`/`grep`/`find`.
- `main` is protected — branch and open a PR; don't push to `main`. Only commit
  or push when the user asks.
- A `GateGuard` hook requires stating the request + what a command verifies
  before the first Bash command of a session.
