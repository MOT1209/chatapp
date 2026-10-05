# Changelog

All notable changes to ChatApp are documented here.

## Unreleased

Mobile + desktop development pass on `v0.0.2-beta`'s stabilized base, plus the first
working password-reset email. See `docs/ui-plan.md` for the UI picture.

### Audit pass (quality, security, stability)

Found by running the whole stack rather than reading it; each fix has a test that fails
without it. Details in `docs/QUALITY_REPORT.md`.

- **Fixed: the emailed reset link did nothing.** The app never read the URL, so the link
  opened Login and the token was lost. The web build now opens the new-password step with
  the code pre-filled (`resetTokenFromUri`).
- **Fixed: refresh-token reuse signed users out everywhere.** Two browser tabs share one
  refresh cookie; the loser of a refresh race looked like theft and revoked every session.
  A short grace window (`REFRESH_REUSE_GRACE_SECONDS`, default 10) refuses the stale token
  without revoking; later reuse still revokes all. The client adopts a token another tab
  just stored instead of clearing it.
- **Fixed: 500 on bad input.** A lone UTF-16 surrogate (an emoji cut in half) or a NUL byte
  in any text field, an oversized body (now 413), an unsupported content-encoding (415) and
  an undecodable path escape all returned 500. All are 4xx in the standard envelope now.
- **Fixed: `start-server.bat`** wrote the same JWT secrets, committed to the repo, into every
  install (anyone on the LAN could forge tokens), overwrote `.env` on each run, built an
  invalid URL for passwords with `@ : / %`, and used the shared `postgres` database (the
  cause of `prisma migrate deploy` P3005). It now generates random secrets, URL-encodes,
  keeps an existing `.env` and uses a dedicated `chatapp` database.
- **Fixed: a secret loader that crashed on unrelated variables.** `*_FILE` secret loading
  scanned every `*_FILE` variable (`SSL_CERT_FILE`, ...). It is now an allowlist.
- **Fixed: tablet layout.** At 600-719 px the chat pane was 218 px wide. Below 720 px the
  rail shows one pane at a time. The bubble time row no longer overflows.
- **Security: WebSocket abuse limits** (per-account connection cap, per-socket frame budget,
  slow-reader drop, close code 4429), and no reset link is printed to the console unless
  `DEV_LOG_RESET_TOKEN=true` in development (production refuses it).
- **Dependencies:** `npm audit` 6 advisories (1 critical, 1 high; dev tooling only) -> 0 via
  Vitest 5 + Vite 7 (Node >= 22.12 for the backend tests). Dependabot now covers npm and pub.
- **CI hygiene:** `dart format` was failing on 8 files; fixed.
- **Tests:** backend 239 -> 312, Flutter 150 -> 378 (13 window sizes x en/ar/de x text scale
  1.0/1.5/2.0 x light/dark, signed-out screens, software keyboard, pagination under heavy
  timestamp ties, the second half of the end-to-end journey).

### Added

- **Password-reset email.** `forgot-password` emails a reset link over SMTP
  (`backend/src/services/email.service.ts`, nodemailer). Without a transport the endpoint
  is unchanged and logs only that no mail was sent (never the address or the token); a
  provider failure is logged by error name, swallowed, and cannot 5xx or reveal whether an
  address is registered. Contract §3.1/§6.6. (An earlier draft of this entry described a
  Resend-based `lib/mailer.ts` and an `APP_WEB_URL` setting; neither exists.)
- **German**, alongside Arabic and English, selectable from Profile.
- **Connection banner.** Connecting / reconnecting / lost (with "Retry now") / a brief
  "Connected" after recovery, shown on Home and in the full-screen phone chat. Replaces
  the small offline chip.
- **"Keep me signed in."** Unticked (default on), the session lives in memory only and
  is gone on next launch — for a shared or borrowed device.
- **"New chat"**: a FAB on phones, a header button on wider layouts; both focus search.
  Desktop also gets `Ctrl`/`⌘`+`K` (focus search) and `Esc` (close the open chat).
- Design tokens (`AppSpacing`, `AppRadius`, `minTapTarget`) and shared theming for
  cards, dialogs, list tiles, the app bar, snackbars and chips; every button now has a
  48px minimum tap target.
- `.github/workflows/release.yml` builds Linux (tar.gz) and macOS (unsigned `.app` zip)
  alongside the existing Web/Android/Windows artifacts.

### Removed

- `render.yaml`: deployment is postponed. `docs/deployment.md` keeps the prepared Blueprint (Frankfurt, paid plans, internal-only database) and the steps to resume.

### Security

- **Password reset is now deliverable.** The reset token was hashed, stored, and then
  dropped — nothing could ever complete a reset in production. It is now emailed over
  SMTP with a link built from `APP_BASE_URL`, which must be `https://` in production.
  **The API refuses to start in production without SMTP configured.** Dev and test start
  without it and send no mail, so neither needs a mail provider.
- `forgot-password` gained a **per-account cooldown** (default 300s). Inside the window
  the request is silently ignored and mints no token; unknown addresses send no mail at
  all. Both keep the response identical so the endpoint still cannot enumerate accounts
  or be used as a spam amplifier.
- **Web clients no longer hold the refresh token where JavaScript can read it.** It now
  travels in an `HttpOnly` cookie scoped to `/api/auth`, so an XSS or a compromised
  dependency cannot exfiltrate it; the web build keeps only the 15-minute access token
  in `localStorage`. A refresh token left there by an older build is deleted on boot.
- Because the cookie is ambient authority, `POST /auth/refresh`, `POST /auth/logout`
  and the new `GET /auth/csrf` require an `X-CSRF-Token` header (an HMAC of the refresh
  token). Native clients are unchanged — they keep using the JSON body.
- **The refresh token no longer reaches a browser at all.** Moving it into an `HttpOnly`
  cookie is only half the fix: it was still returned in the JSON body, which any script
  running on the page can read from its own `fetch` response. A browser now sends
  `X-Client-Platform: web` on register/login/refresh and the server omits `refreshToken`
  from the response. The header is optional and defaults to the old behaviour, so every
  native build keeps working untouched and a web client that omits it still receives a
  usable cookie.
- A logout carrying a cookie without a valid CSRF token clears the cookie and returns
  `204` but revokes nothing, since the request cannot be trusted; a real client with a
  stale CSRF token is never locked out.
- **Security headers are explicit rather than Helmet's defaults**: deny-all CSP
  (including `frame-ancestors 'none'`), HSTS in production, and `require-corp` /
  `same-origin` COEP/COOP.
- **Secrets can be read from files.** Any config variable accepts a `*_FILE` variant
  (`JWT_ACCESS_SECRET_FILE`, `SMTP_PASS_FILE`, …) for container and Kubernetes secret
  mounts, so credentials need not appear in an environment dump or process listing.
- Startup now rejects a wildcard `CORS_ORIGIN` in production (requests are credentialed)
  and `SameSite=None` without `Secure`. A password-reset mail that fails is logged by
  error type only and still answers `202`, so a provider error can't leak credentials or
  reveal that an address exists.

### Fixed

- App: the register form capped passwords at 72 *characters*, but the server caps them at 72 UTF-8 *bytes* (bcrypt). An Arabic password of 37–72 letters passed the form and was then rejected. The form now counts bytes and says that Arabic letters count as 2.
- App: server validation errors now show the rule for the field (username, email, password, display name, image URL, identifier) instead of a generic "Check this field".
- App: a rate-limited request says how long to wait (from `Retry-After`) instead of only "wait a moment".
- Backend: CORS exposes `Retry-After`, which browsers otherwise hide from the web client.
- App: "Retry now" on the connection banner works while an attempt is hanging; the banner no longer stays stale after the client stops.
- CI: `windows-latest`/`macos-latest` pinned to `windows-2025`/`macos-15`; `softprops/action-gh-release` pinned to a commit SHA; Dependabot keeps GitHub Actions current.
- **Backend error messages are now localized**, mapped by the contract's `code` (contract
  §1.1 updated accordingly). The server's English `message` text no longer reaches the UI;
  an unrecognized code falls back to a generic, localized message. A `502`/`503`/`504`
  reads as "server unavailable" rather than a raw status code.
- **Desktop tokens are no longer plaintext.** Windows, Linux and macOS now use the OS
  credential store (DPAPI / libsecret / Keychain) like Android and iOS already did; web
  keeps `localStorage` (documented trade-off, unchanged). Existing plaintext tokens from
  v0.0.1 are migrated once, then deleted either way.
- `render.yaml` pins `NODE_VERSION=22`; `docs/deployment.md` documents the failure seen when a Render service is created by hand instead of from the Blueprint.
- `.github/workflows/*.yml`: actions moved to their lowest Node-24 major (`checkout`@v5,
  `setup-java`/`setup-node`@v5, `upload-artifact`@v6, `download-artifact`@v7,
  `action-gh-release`@v3) ahead of GitHub's Node 20 removal; runners pinned to
  `ubuntu-24.04` ahead of the `ubuntu-latest` move to Ubuntu 26.

### Added (earlier, unreleased)

- `render.yaml` and `docs/deployment.md`: Render Blueprint for the backend + PostgreSQL (validated locally in production mode; not yet deployed to a live account).

## v0.0.2-beta — 2026-09-30

Stabilization release after `v0.0.1-alpha` (which is unchanged). Web, Android APK and
Windows builds are produced by `.github/workflows/release.yml`. See the sections below
for details, and `docs/development.md` → Releases for the build limitations.

### Fixed

- **A WebSocket no longer outlives its credentials.** The server closes it with `4401` when the access token used to authenticate expires, and on logout or password reset. The Flutter client already refreshes and reconnects on `4401`. (audit F-05)
- **Logout after the access token expired left the session alive.** The
  refresh token could still be used afterwards. `POST /api/auth/logout` now
  also accepts an optional `{ "refreshToken" }` body (additive; no body still
  works) and the Flutter client sends it. (audit F-01)
- **Passwords are limited in bytes, not characters.** bcrypt ignores everything
  after byte 72, so a 40-letter Arabic password was silently truncated. Register
  and reset now reject more than 72 bytes with a `VALIDATION_ERROR`. Existing
  accounts are unaffected: login does not apply the limit. (audit F-11)
- `avatarUrl` accepts only `http(s)` URLs, as the contract already stated;
  `javascript:`, `data:` and `file:` were accepted before. (audit F-09)
- A message cursor holding an unparseable date returns `400 VALIDATION_ERROR`
  instead of `500`. (audit F-08)

- Merged earlier in [#12](https://github.com/MOT1209/chatapp/pull/12) (listed here
  because it was not in this file): atomic refresh rotation that revokes every
  session when a rotated-out token is replayed; concurrent sends with one
  `clientId` return the original message instead of `500`; equal-cost password
  check for unknown accounts; `%`/`_` no longer act as wildcards in user
  search; the newest password-reset link supersedes older ones; WebSocket
  protocol heartbeat, per-socket frame budget, presence reset on boot and
  graceful shutdown; JWT algorithm pinned to HS256; credentialed CORS removed.

### Added

- `.github/workflows/release.yml`: builds Web, Android APK and Windows zip; a `v*` tag creates a draft GitHub Release. macOS/Linux/iOS deferred. See `docs/development.md` → Releases.
- `docs/DEVELOPMENT_AUDIT.md` — Phase 0 audit and its status table.

### Stabilization pass (prepared for v0.0.2-beta)

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
  send-failure + retry idempotency, and log-redaction
  tests.

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

[Unreleased]: https://github.com/MOT1209/chatapp/compare/v0.0.2-beta...HEAD
[v0.0.2-beta]: https://github.com/MOT1209/chatapp/compare/v0.0.1-alpha...v0.0.2-beta
