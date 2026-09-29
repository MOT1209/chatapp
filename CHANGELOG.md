# Changelog

All notable changes to ChatApp are documented here.

## Unreleased (prepared for v0.0.2-beta)

`v0.0.1-alpha` is immutable; everything below ships in the next release.
No tag or release has been created.

### Fixed

- **Realtime:** `WsHub.sendToUser` and the per-socket `send` no longer let a
  socket that closes between the `OPEN` check and `send()` throw into the
  caller (previously a committed message could return 500, prompting a client
  retry). A failing socket is terminated so presence cleanup runs; the user's
  other sockets still receive the frame.
- **Presence:** connect/disconnect DB writes are now serialized per user and
  decided from live hub state, so a fast reconnect cannot leave a connected
  user stored as offline.
- **Auth:** logout now accepts an optional `refreshToken` body field so
  sessions are revoked even when the access token has already expired
  (audit F-01). The Flutter client sends it.
- **Logging:** unhandled Prisma errors log only their type/code/target, never
  the message text, which embeds query arguments (audit F-17).
- **Dependencies:** `express` 4.21.2 → 4.22.3; `npm audit --omit=dev` is clean
  and the CI audit step is now blocking.
- **Flutter:** unexpected realtime frame shapes and writes to a just-closed
  socket are dropped instead of raising unhandled errors. *Not executed:*
  no Flutter SDK was available for this change.
- **DX:** root `npm run install:all` now also installs root dependencies, so
  `npm run install:all && npm run dev` works on a fresh clone.

### Tests

- Added hub send-failure, multi-socket presence, fast-reconnect, expired WS
  token, duplicate `auth` frame, production reset-token non-exposure,
  send-failure + retry idempotency, expired-token logout, and log-redaction
  tests (backend: 88 → 101).

## v0.0.1-alpha

First end-to-end release: two real accounts can register, find each other,
and chat in real time. Not production-ready — see "Known limitations" below
and `docs/api-contract.md` §6 for the full list of deliberate gaps.

### Added

- **Authentication** — register, login, refresh (with rotation), logout
  (revokes every session for the account, not just one device),
  forgot/reset password.
- **User profiles** — `GET /api/users/me`, `PATCH /api/users/me`. Never
  returns `passwordHash`, `refreshHash`, or any session secret.
- **User search** — by username or display name, excludes the caller,
  never returns another user's email.
- **Direct conversations** — one conversation per pair of users, enforced
  at the database level (`Conversation.directKey`) so creating one twice
  returns the same conversation instead of a duplicate.
- **Real-time messaging** — send with idempotent retry (`clientId`
  deduplication), cursor-paginated history, delivered live over WebSocket
  to the recipient with no reload required.
- **Typing indicator** — live, transient, never persisted to the database.
- **Read receipts** — marking a conversation read notifies the sender in
  real time; `unreadCount` reflects it immediately.
- **Online/offline presence** — live, scoped to actual conversation
  partners only (not broadcast to every user), correct across multiple
  simultaneous connections for the same account.
- **Message deletion** — soft delete, sender-only, propagated live via
  `message:updated`.
- **Responsive Flutter UI** — phone (single view + bottom navigation),
  tablet (rail + sidebar), desktop (persistent list + chat), Arabic
  (RTL) and English, light/dark/system theme.
- **Security hardening** — WebSocket frames validated at runtime (Zod),
  WebSocket authorization checked against real conversation membership,
  production-strength JWT secret validation, rate limiting on
  auth/search/message-send, no secrets ever logged or returned to a
  client, no stack traces or internal errors exposed in any response.

### Verified

- A full two-person journey — register, search, create a direct
  conversation, send, receive live, type, read, go offline/online, reply,
  receive the reply live — proven end to end against a real backend and a
  real database (`backend/tests/e2e.test.ts`), not mocked.
- 80+ backend unit/integration tests, including the full WebSocket
  protocol (auth handshake, validation, authorization, crash-safety) and
  security-specific tests (JWT secret strength, rate-limit enforcement,
  error sanitization).
- Flutter: reviewed by reading `app/lib/core/{token_storage,api_client,
  realtime_client}.dart` and the existing widget/unit test suite
  (`app/test/`), which already covers login, register, navigation, chat,
  send/retry, realtime delivery, typing, deletion, and responsive
  layouts. **Not executed in this release's preparation** — no Flutter
  SDK was available in that environment. See the release PR for the
  exact caveat; this needs confirming with a real `flutter test` /
  `flutter analyze` run before the platform checkboxes below are trusted
  as more than "should work."

### Known limitations (deliberate, not bugs)

- No email/SMTP provider: password reset tokens are logged to the server
  console in development and never exposed at all in production — there
  is currently no way to complete a production password reset until a
  real provider is wired up.
- No groups, voice calls, video calls, file/image sharing, AI features,
  push notifications, message editing or reactions, end-to-end
  encryption, payments, stories, channels, or bots. All explicitly out of
  scope for v0.0.1.
- Realtime presence/typing state is in-memory and per-process — correct
  for a single backend instance, not yet designed for horizontal scaling.

[Unreleased]: https://github.com/MOT1209/chatapp/compare/v0.0.1-alpha...HEAD
