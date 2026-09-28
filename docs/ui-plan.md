# UI plan

**Status:** placeholder created in Phase 0, describing `frontend/` (React). Since
then `app/` (Flutter) was designated the canonical client and `frontend/` was
frozen — see the note at the top of the root `README.md`. This document is kept
as-is for anyone reviving `frontend/`; it does not describe `app/`.

## Current implementation (frontend, as of Phase 0)

- React 19 + TypeScript + Vite.
- Tailwind CSS 4 with tokens declared in `@theme inline`; Cairo variable font.
- RTL-first Arabic UI using CSS logical properties (`ms-*`, `pe-*`, `start-*`, `end-*`) so LTR works from the same stylesheet.
- Light / dark / system themes.
- Three responsive layouts:
  - mobile (single-pane),
  - tablet (two columns),
  - desktop (three columns).
- Auth screens: login, register, forgot password (UI only — no backend yet).
- Conversation list with debounced search and idempotent "new conversation" action.
- Message list with grouped bubbles, day dividers, and pending / sent / read / failed states.
- Realtime primitives: typing indicator, presence, read receipts, WS reconnect with backoff, offline banner.
- Profile view / edit with connection state and logout confirmation.

## Directory conventions

- `src/lib/` — infrastructure only. No React imports.
- `src/features/<domain>/` — one folder per domain. Features do not import each other.
- `src/components/` — shared presentational components with no domain knowledge.
- `src/stores/` — Zustand stores.
- `src/hooks/` — cross-cutting hooks.
- Tailwind is the only styling system. No CSS modules, no inline style objects.

## Deferred to Alpha and beyond

- Message list virtualisation for very long threads.
- Bundle code-splitting (`React.lazy` for auth and profile pages) once the bundle grows.
- Playwright E2E suite.
- Groups, file uploads, voice messages, calls, AI features.
