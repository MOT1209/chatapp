# Development Audit — ChatApp Alpha v0.0.1

**Phase 0 deliverable.** Audit of `main` at `c94ae2b` (tag `v0.0.1-alpha`).
No production code was changed to produce this document.

> **Read §13 first.** `main` moved while this audit was being written: PR #12
> fixed several of these findings before the audit was merged. Sections 1 to 12
> are the original audit of the tag and are kept unchanged as the historical
> record. §13 is the current status of every finding, re-checked on a later `main`.

## 1. Method and evidence levels

Every finding carries one evidence level. Do not treat them as equal.

| Tag | Meaning |
| --- | --- |
| **VERIFIED** | Reproduced by executing code against a real PostgreSQL 16 in this audit. |
| **READ** | Established by reading the source. Not executed. Could be wrong. |
| **UNVERIFIED** | Plausible from experience, not confirmed either way. Needs a probe. |

**What could not be done in this environment**

- The Flutter/Dart SDK is not installed, so `flutter analyze`, `flutter test` and every Flutter finding below are **READ only**. The CHANGELOG already states the same caveat for the release itself: the Flutter suite was not executed when Alpha was cut. Nobody has evidence in the repo that it is green.
- No rendering, so UI, accessibility and responsive findings are limited to code inspection.
- No load or concurrency testing beyond the probes listed.
- Reviewed by reading: all of `backend/src`, `backend/prisma`, the CI workflows, `docs/`, and `app/lib/core`, `app/lib/state`, `app/lib/main.dart`, `app/lib/app.dart`. The UI screens (`app/lib/ui/`) were only skimmed with counts, not read line by line.

## 2. Baseline (executed)

| Check | Result |
| --- | --- |
| `prisma migrate deploy` (2 migrations) | applied cleanly |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` (Vitest, real Postgres) | **81 / 81 passed**, 8 files, ~13 s |
| `npm audit --omit=dev` | **4 vulnerabilities (2 high, 2 moderate)**, see F-07 |
| Flutter analyze / test | **not run** (no SDK) |
| Remote tag `v0.0.1-alpha` | exists, annotated, peels to `c94ae2b` |

The suite is green, but see §6: it does not exercise concurrency, expired-token flows, or rate limiting, which is exactly where the confirmed defects below sit.

## 3. Summary

No **P0** (data loss, unauthenticated access, remote code execution) was found.

| Severity | Count | Meaning |
| --- | --- | --- |
| P1 | 7 | Breaks a documented guarantee, a security property, or reliability under normal real-world use. Fix before any new feature. |
| P2 | 13 | Real defect or risk with limited blast radius. Fix during Phase 1. |
| P3 | 6 | Hygiene. Fix opportunistically. |

Eight findings (F-01, F-02, F-03, F-07, F-08, F-09, F-10, F-11) were reproduced by running code (marked VERIFIED); F-05 is verified on the REST side only.

## 4. P1 findings

### F-01 — Logout with an expired access token does not revoke anything — VERIFIED
- **Where:** `auth.controller.ts` `logoutHandler`, `auth.service.ts` `tryIdentifyFromAccessToken`. Documented as intended in `api-contract.md` §3.1 ("missing or already-expired [token] is not an error").
- **Evidence:** probe with an expired JWT: `POST /auth/logout → 204`, then `POST /auth/refresh` with the same session's refresh token → **200**.
- **Impact:** the access token lives 15 minutes, so any user who taps "Log out" after 15 minutes idle believes they are signed out while the 30-day refresh token stays valid server-side. A stolen refresh token survives the user's logout. The UI also clears local tokens, so the user has no way to notice.
- **Fix (additive, no break):** accept an optional `refreshToken` in the logout body and revoke that session by hash; the client already holds it. Keep "always 204" and keep the logout-everywhere behavior for callers with a valid access token. Add a test for both paths.

### F-02 — Refresh-token rotation is racy and has no reuse detection — VERIFIED
- **Where:** `auth.service.ts` `refresh()` does `findUnique` then `update`, not an atomic conditional update.
- **Evidence:** 6 concurrent refreshes with one token → **6 × 200**, six new live sessions.
- **Impact:** rotation is meant to make a stolen token single-use. It does not. Also, presenting an already-rotated token is not treated as a compromise signal.
- **Fix:** claim the session with `updateMany({ where: { id, revokedAt: null }, data: { revokedAt } })` and require `count === 1`; on a reused (already revoked) token, revoke the user's whole session family. Add a concurrency test.

### F-03 — Concurrent send with the same `clientId` returns 500 — VERIFIED
- **Where:** `message.service.ts` `sendMessage`: check-then-insert, no handling of the unique violation on `(senderId, clientId)`. `isUniqueConstraintError` already exists and is used elsewhere.
- **Evidence:** 8 parallel identical sends → statuses `500,500,200,500,201,500,500,500`. One message stored, six clients told "server error".
- **Impact:** this is precisely the retry scenario `clientId` idempotency exists for (flaky network, double tap, client retry racing the first request). The client marks the message *failed* although it was delivered, prompting a manual retry.
- **Fix:** on unique violation, re-read by `(senderId, clientId)` and return it with `isNew: false`, mirroring what `createDirect` already does for `directKey`.

### F-04 — Presence can be permanently wrong — READ
- **Where:** `ws-server.ts`, `server.ts`.
- **Reasons (three independent):**
  1. `User.isOnline` is persisted and only set to `false` from the socket `close` handler. A crash, OOM kill, deploy or `SIGKILL` skips it. Nothing resets the column on boot. Those users show online indefinitely.
  2. The server never pings clients (`ws` heartbeat). A half-open TCP connection (phone loses signal) is not detected, so the user stays online until the OS times the socket out, often minutes.
  3. `handleConnect` and `handleDisconnect` each do an async DB write with no ordering. A fast reconnect can finish the connect-write before the earlier disconnect-write, leaving `isOnline=false` for a connected user.
- **Also:** `shutdown()` calls `server.close()`, which waits for open WebSockets, so it always hits the 10 s timeout and exits with code 1.
- **Fix:** reset `isOnline=false` at startup; server-side ping/pong with `terminate()` on a missed pong; derive presence ordering safely (single transaction or compare-and-set on a connection generation); close the `WebSocketServer` in `shutdown()`.

### F-05 — WebSocket sessions outlive the access token, logout and password reset — READ (REST side VERIFIED)
- **Where:** `ws-server.ts` verifies the token once, in the first frame.
- **Evidence:** REST: after `logout`, `GET /users/me` with the old access token → **200** (VERIFIED, expected for a stateless JWT). WebSocket: no re-check after the first frame (READ).
- **Impact:** a connection stays fully authorized indefinitely, past token expiry, past logout, past "reset password kills every session". This defeats the intent of `resetPassword`'s session revocation.
- **Fix:** bind the socket to the token `exp` and close with 4401 at expiry (client already refreshes and reconnects on 4401); on logout or reset, close the user's sockets via the hub. Decide separately whether access tokens should carry a session id (`sid`) checked against `Session.revokedAt`.

### F-06 — WebSocket frames are unthrottled and unbounded per user — READ
- **Where:** `ws-server.ts`.
- **Impact:** each authenticated `typing` frame costs 2 DB queries (`assertMember`, `getOtherMemberIds`); each `read` frame costs 5 to 6 writes and reads. There is no per-socket or per-user frame rate limit and no cap on concurrent sockets per user. One valid account can drive database load or exhaust memory. HTTP has limiters; WebSocket has none. The security model in the plan lists "WebSocket abuse" and "spam" explicitly.
- **Fix:** token-bucket per socket (drop or close on excess), a per-user connection cap, and a short in-memory membership cache for `typing`.

### F-07 — Production dependency vulnerabilities — VERIFIED
- **Evidence:** `npm audit --omit=dev`: `express` 4.21.2 (**high**, direct), `path-to-regexp` (**high**, transitive), `body-parser` and `qs` (moderate, transitive). All resolve with `express@4.22.3`. `package.json` pins exact versions, so `npm audit fix` will not move it without an explicit bump.
- **Note:** exploitability against this specific app was not assessed. Bump and re-run the suite regardless.
- **CI gap:** no workflow step runs `npm audit`, dependency review or any security scan, although the quality gate in the project plan requires "security checks".

## 5. P2 findings

| ID | Finding | Evidence | Where | Fix direction |
| --- | --- | --- | --- | --- |
| F-08 | Invalid `createdAt` inside a message cursor gives **500** instead of 400. `decodeCursor` only checks `typeof string`; `new Date('x')` reaches Prisma. | VERIFIED | `lib/cursor.ts`, `conversation.service.ts` | Validate with `Number.isNaN(date.getTime())`, return `VALIDATION_ERROR`. |
| F-09 | `avatarUrl` accepts `javascript:` URLs. Contract §3.2 says "valid `http(s)` URL". Contract and code disagree; the code is wrong. | VERIFIED | `users.validators.ts` | Restrict to `https:` (and `http:` in dev). Phase 3 replaces free-form URLs with owned media. |
| F-10 | User search treats `%` and `_` as SQL wildcards. `q=%%` passes the 2-character minimum and matches every user, bypassing the intent of the minimum and enabling full user enumeration. | VERIFIED | `user.service.ts` `search` | Escape `%`, `_`, `\` or move to a trigram index with escaped input. |
| F-11 | bcrypt silently truncates at **72 bytes**, but validation counts characters. A 40-character Arabic password is 80 bytes; login succeeded with a different tail after byte 72. | VERIFIED | `auth.validators.ts`, `lib/password.ts` | Validate `Buffer.byteLength(pw) <= 72` (or pre-hash consistently). Arabic-first product, so this matters more than usual. |
| F-12 | One `authRateLimit` instance is shared by register, login, forgot-password and reset-password: 20 requests per 15 min per IP across all four together. `/auth/refresh` and `/auth/logout` have **no** limiter. No per-account brute-force protection. The store is in-memory per process. | READ | `middleware/rate-limit.ts`, `auth.routes.ts` | Separate budgets per route; add a per-identifier login limiter; limit refresh. Shared store (Redis) only when multi-instance (Phase 9). |
| F-13 | Login timing leaks account existence: unknown user returns immediately, known user pays a bcrypt compare. Contract §3.1 explicitly wants non-enumeration. `register` also reveals taken usernames/emails via 409 field messages. | READ | `auth.service.ts` `login` | Compare against a dummy hash when the user is missing. Registration disclosure is a product decision; record it as accepted or change it. |
| F-14 | Password-reset token use is check-then-act; two concurrent resets with one token can both succeed. Requesting a reset does not invalidate earlier unused tokens. | READ (probe not written) | `auth.service.ts` `resetPassword` | `updateMany({ where: { tokenHash, usedAt: null } })` inside the transaction and require `count === 1`; invalidate older tokens on issue. |
| F-15 | `GET /conversations` is unbounded (no pagination) and loads both members plus last message for every conversation. `toDTO` throws a plain `Error` if a direct conversation has no *other* member, which would 500 the entire list for that user. Today only a future user-deletion path can create that state (FK `ON DELETE CASCADE` on `ConversationMember`). | READ | `conversation.service.ts` | Cursor-paginate the list; make `toDTO` failure non-fatal per item. |
| F-16 | Presence and `lastSeenAt` are exposed to **every authenticated user** through `GET /users/:id` and search, contradicting the "scoped to actual conversation partners" claim in the CHANGELOG (true only for the WebSocket broadcast). | READ | `serializers.ts`, `user.service.ts` | Decide the privacy rule now; it gates Phase 6 (privacy settings, blocking). |
| F-17 | No request ID, no access log, no latency/status metrics. The logger is a thin `console` wrapper with no redaction layer. Prisma validation errors embed query arguments in the thrown message, and the error handler logs `err.stack`; the F-08 probe showed argument values (a conversation id) in the log. Whether a *message body* can reach the log this way is **UNVERIFIED**, but the mechanism exists. | READ / UNVERIFIED | `logger.ts`, `error-handler.ts` | Add request-scoped logging, an explicit redaction list, and log only Prisma error `code`/`meta.target`, not the message. |
| F-18 | `/health` is liveness only. No DB readiness check, so an instance that lost its database still reports healthy. | READ | `routes/health.ts` | Add `/ready` with a bounded `SELECT 1`. |
| F-19 | `Session` and `PasswordResetToken` rows are never purged. Each refresh creates a new `Session` row, so growth is proportional to active users × refresh frequency. | READ | `schema.prisma`, `auth.service.ts` | Scheduled cleanup of expired/revoked rows. |
| F-20 | `NODE_ENV=test` disables every rate limit and the production secret checks. Nothing prevents a deployment from setting it. Integration tests therefore never exercise real limiters (one unit test builds a limiter by hand). | READ | `rate-limit.ts`, `env.ts` | Fail startup if `NODE_ENV=test` with a non-local `DATABASE_URL`; inject limiter config instead of switching on `NODE_ENV`. |

## 6. P3 findings

- **F-21** Tokens are stored in plain `shared_preferences` on web (`localStorage`, XSS-readable) and desktop (plain file). Documented as known in `plan.md`. — READ
- **F-22** `AppConfig` defaults to `http://` and `ws://localhost`; nothing forces `https`/`wss` in release builds. — READ
- **F-23** The client shows server error messages verbatim. They are English, so the Arabic UI shows English errors. `ApiException.network()` is also a hard-coded English string. Already listed in `plan.md`. — READ
- **F-24** `app.set('trust proxy', 1)` is hard-coded. A different proxy depth makes `req.ip` (and every IP limiter) wrong or spoofable. — READ
- **F-25** `docs/api-contract.md` shows JWT-looking refresh tokens (`eyJ…`); the real ones are opaque 96-char hex strings. Cosmetic, but the contract is meant to be the single source of truth. — READ
- **F-26** The backend workflow is path-filtered (`backend/**`). If it becomes a *required* status check, PRs that touch only `app/` or `docs/` never report it and can be blocked or, depending on ruleset settings, unprotected. The repo has a `docs/branch-protection-note` branch; its content was not reviewed. — READ / UNVERIFIED

## 7. Documentation versus implementation

| Doc statement | Reality |
| --- | --- |
| Contract §3.2: `avatarUrl` is a valid `http(s)` URL | Any URL scheme accepted (F-09). |
| CHANGELOG: presence "scoped to actual conversation partners only" | True for WebSocket frames, false for REST (F-16). |
| CHANGELOG: "no secrets ever logged" | True for the code paths written; not proven for Prisma error messages (F-17). |
| Contract §3.1: logout "always responds 204" | True, and that is the defect in F-01. |
| Contract §4: heartbeat is client-driven only | Matches code; the missing server side is F-04. |
| README/CHANGELOG: "50+" / "80+" backend tests | Measured: **81**. Accurate. |
| CHANGELOG: Flutter suite reviewed, "not executed" | Still true. No Flutter result exists for this audit either. |

## 8. Architecture blockers for later phases

These are not bugs. They are places where the current design will break the next phase if left as is.

1. **Read receipts are a single `Message.readAt`.** That models exactly one reader. It cannot represent a group. Phase 2 needs per-member read state (for example `ConversationMember.lastReadAt` / `lastReadMessageId`), and `unreadCount` and the `status: sent|read` field must be redefined. Decide this before writing group code.
2. `Conversation.type` is a free `String`, not an enum or check constraint; `ConversationDTO` is typed `'direct'` and carries a single `participant`. The list, serializer and Flutter `Conversation` model all assume two people.
3. `ConversationMember` has no `role`, no `mutedUntil`, no `leftAt`. Groups, mute and notifications each need columns.
4. `wsHub` is an in-memory map and `message.service` calls it directly. A `Realtime` publisher interface is needed before Redis (Phase 9), and the cheapest time to introduce it is when group fan-out is written.
5. Fan-out issues one `getOtherMemberIds` query per event. Fine for two people; needs a cached membership lookup for groups.
6. `Message` has no `editedAt`, `replyToId`, `type`, or attachment relation. Adding them later is a plain migration; no redesign needed.
7. No search index: `body` has none, `User` search is `ILIKE %q%` (sequential scan). Phase 4 needs `pg_trgm` or full-text, chosen with `EXPLAIN` data, not guesswork.

## 9. Test-coverage gaps

Backend (81 tests, no coverage tool installed):

- No concurrency tests at all. F-02 and F-03 would have been caught by one.
- No test for logout or refresh with an **expired** access token.
- No integration test that a rate limiter actually returns 429 on a real route.
- No test for WebSocket behaviour after token expiry, logout or reset (F-05).
- No test for malformed cursor contents (F-08), wildcard search (F-10), multi-byte passwords (F-11), or scheme-restricted avatar URLs (F-09).
- No test for reconnect ordering or presence after an unclean shutdown (F-04).

Flutter (6 test files, not executed here):

- Covered by name: login, register, navigation, chat send/retry, realtime delivery, typing, deletion, responsive layouts, API client refresh, realtime client.
- Not visible in the tests: token-storage implementations, offline/backoff behaviour beyond the realtime client, long-history pagination in the UI, RTL golden checks, accessibility.

## 10. Flutter, UX, accessibility (READ only)

- `provider` + `ChangeNotifier` controllers. Simple and adequate at this size; the controllers are testable (constructor-injected API and frame stream). No change recommended in Phase 1.
- `ChatController._upsert`, `_merge` and `_sorted` rebuild and re-sort the whole message list on every frame. Acceptable for hundreds of messages, a measurable cost for thousands. **Measure before changing.**
- `ChatController._onFrame` casts `p['message'] as Map<String, dynamic>` without a guard; a malformed frame from a newer server would throw inside the stream callback.
- Loading and error states exist (`state_views.dart`, per-controller `loading`/`error`). No skeletons, no `RepaintBoundary`, no text-scale handling found by search.
- Accessibility signals by count: 12 `Semantics`, 4 `tooltip:`, 0 `semanticLabel`, 5 `autofillHints`. A real audit needs a screen reader pass and contrast checks on a running build.
- Localization: Arabic and English via ARB with an embedded Arabic font. Server error text is not localized (F-23). Pluralization coverage was not checked.

## 11. Proposed Phase 1 order (requires your approval)

Small, test-first, one PR per cluster. Nothing here adds a user-visible feature.

1. **Auth session integrity:** F-01, F-02, F-14, F-13, F-12 (auth part).
2. **Message send correctness:** F-03, F-08, plus the F-10/F-09/F-11 input-validation fixes.
3. **Realtime hardening:** F-04, F-05, F-06.
4. **Dependencies and CI:** F-07 (bump Express, add `npm audit --omit=dev` at high level to CI), F-26 review.
5. **Observability and ops:** F-17, F-18, F-19, F-20, F-24 (request ID, redaction, `/ready`, cleanup job).
6. **Flutter:** get `flutter analyze` and `flutter test` executed in CI evidence for the first time; then F-22 and F-23.
7. **Before Phase 2:** settle the read-state model (§8.1) and the presence-privacy rule (F-16) as written decisions.

Each PR must update `docs/api-contract.md` if it changes a wire behavior (only F-01 adds an optional field), add the migration if it changes the schema, and add the regression tests named in §9.

## 12. Explicitly not done in this audit

- No production code, schema or contract changes.
- No load test, no penetration test, no dependency license review.
- No verification of GitHub-side settings (rulesets, branch protection, App permissions). The 403 on tag push seen earlier was a GitHub permission issue outside the code base; the tag was later pushed successfully from a developer machine.
- Flutter behaviour and UI quality are unverified until someone runs the SDK.

## 13. Status update (re-baselined after PR #12)

**Why this section exists.** I audited the tag `v0.0.1-alpha` (`c94ae2b`) and only
afterwards noticed that `main` had already moved (PR #12, commits `4771d13` and
`e22f73b`, written by another session). The audit was merged without first
re-checking it against that newer `main`. That was my process error: the
document therefore overstated what was open. This section corrects it.

**Re-baseline on `main` at `5653073` (executed):** typecheck clean, lint clean,
**88 / 88** tests pass. The probes from §4/§5 were re-run against it.

| ID | Status now | Evidence |
| --- | --- | --- |
| F-01 logout after expiry | **Fixed in this PR** (backend + Flutter client) | Was reproduced open on `main`: `logout 204`, then `refresh 200`. Now covered by 3 new tests. Flutter side edited but **not executed**. |
| F-02 refresh rotation race | **Fixed by #12** | Re-probe: 6 concurrent refreshes → `401,401,200,401,401,401`, 1 live session. Also revokes all sessions when a rotated-out token is replayed. Trade-off to know: a client that lost the response and retries with the old token signs the user out everywhere. |
| F-03 same-`clientId` race | **Fixed by #12** | Re-probe: `200 ×7, 201 ×1`. |
| F-04 presence | **Mostly fixed by #12** (READ) | Boot reset, protocol ping/pong with terminate, graceful WS shutdown. **Still open:** connect/disconnect write ordering can leave `isOnline=false` for a connected user. |
| F-05 WS outlives token/logout/reset | **Fixed** | Socket closes with 4401 at access-token expiry and on logout / password reset; regression tests in `tests/realtime-resilience.test.ts`. |
| F-06 WS frame limits | **Partly fixed by #12** (READ) | Per-socket budget for `typing`/`read`. **Still open:** per-user connection cap; membership lookup per `typing` frame. |
| F-07 dependency vulnerabilities | **Open** | Re-run: still 4 vulnerabilities (2 high) on `express@4.21.2`. #12 added an `npm audit` CI step but with `continue-on-error: true`, so it does not gate anything. |
| F-08 bad cursor date → 500 | **Fixed in this PR** | Was `500` on `main`. 3 new test cases; the unparseable-date one failed before the fix. |
| F-09 `javascript:` avatar URL | **Fixed in this PR** | Was `200` on `main`; 4 new tests (`javascript:`, `data:`, `file:`, `ftp:`). |
| F-10 search wildcard | **Fixed by #12** | Re-probe: `q=%%` → 0 results. |
| F-11 password bytes | **Fixed in this PR** | Was `200` (tail ignored) on `main`. Register and reset now reject > 72 bytes. Login is intentionally unchanged so existing long passwords still work. 3 new tests. |
| F-12 auth rate limits | **Worse in one respect** | #12 put `/auth/refresh` under the same shared `authRateLimit` bucket as login/register/reset (20 per 15 min per IP). Refresh is routine traffic, so it now competes with login for one small budget. Per-route budgets and a per-identifier login limiter are still open. |
| F-13 login timing | **Fixed by #12** (READ) | Dummy-hash comparison for unknown users. Timing itself was not measured. |
| F-14 reset-token single use | **Half fixed by #12** | Newer link supersedes older ones. **Still open:** the "claim" is check-then-act, so two concurrent resets with one token are not prevented (READ). |
| F-15 to F-20 | **Open** | Not addressed. |
| F-21 to F-26 | **Open** | Except: #12 pinned JWT verification to HS256 and removed credentialed CORS (both good, neither was in this audit). |

**Open P1 items after this PR:** F-07, and the remaining halves of F-04 and F-06.
**Proposed next block:** F-07 (dependency bump plus a CI audit that fails on high), then F-05 (WebSocket vs token lifetime).
