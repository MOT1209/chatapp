# Phase 1 Audit — Foundation, Stabilization & Engineering Hardening

**Scope:** `main` plus the in-progress Phase 1 branch, re-audited from source.
**Method:** read every backend source file, every Prisma migration, all three CI
workflows, the Flutter `core/`, `models/`, `state/`, `main.dart` and `app.dart`,
and all documentation. Backend findings marked VERIFIED were reproduced by
executing the suite against a real PostgreSQL 18.

This supersedes nothing: [`DEVELOPMENT_AUDIT.md`](./DEVELOPMENT_AUDIT.md) is the
Phase 0 record and stays as the historical baseline. Its finding IDs (F-nn) are
referenced here so progress stays traceable.

## Evidence levels

| Tag | Meaning |
| --- | --- |
| **VERIFIED** | Reproduced by running code against a real PostgreSQL. |
| **READ** | Established by reading the source. Not executed. |
| **BLOCKED** | Could not be checked in this environment. Stated, not assumed. |

## What could not be done here — read this before trusting the rest

- **No Flutter/Dart SDK on `PATH`.** `flutter analyze`, `dart format`, `flutter
  test` and every `flutter build` target were **not executed**. Every Flutter
  finding below is therefore READ or BLOCKED. This is the same caveat that
  applied to the Phase 0 audit, and it is now the single largest gap in Phase 1:
  the client half of the repository has no executed evidence.
- **No Docker daemon**, so the PostgreSQL service container CI uses was not
  reproduced; a locally installed PostgreSQL 18 was used instead.
- **No deployment, no GitHub-side settings.** Rulesets, branch protection and
  Actions permissions cannot be read from here.
- **No load, penetration or dependency-license testing.**

Baseline executed: `typecheck` clean, `lint` clean, **239/239 tests passing** at
commit `a8588a4`, plus 12 new configuration-guard tests. Suite wall time reduced
from 124 s to 46 s as part of this phase (see *Performance*).

---

## 1. Architecture audit

The architecture is fundamentally sound and was **kept**. Nothing was rebuilt.

The backend is a conventional, well-separated Express application: `routes` wire
middleware, `controllers` handle only req/res, `services` own business logic and
every Prisma query, `validators` hold the single Zod input boundary, `lib` holds
infrastructure, `realtime` owns the WebSocket layer, and `scripts` holds
operational CLIs kept off the request path. There are no circular dependencies,
no business logic in routes, and no stray DB queries in controllers.

Scale: 44 backend source files / ~3.3k LOC, 19 test files / ~4k LOC, 251 test
cases; 38 Flutter files / ~6.3k LOC with 10 test files; 2 Prisma migrations.

Deliberately not changed: Flutter stays Flutter, Express stays Express, Prisma
stays Prisma, PostgreSQL stays PostgreSQL.

### Findings

| # | Finding | Level |
| --- | --- | --- |
| A-1 | The in-progress Phase 1 branch was **not buildable when received**: `typecheck` failed and 2 tests failed. See §2. | VERIFIED |
| A-2 | A half-finished cursor refactor was committed to the working tree: the field was renamed on the encode side only. See §2. | VERIFIED |
| A-3 | `wsHub` is an in-memory `Map`, so realtime is correct for exactly one backend process. Scaling needs a shared pub/sub behind the same interface. | READ |
| A-4 | Fan-out issues one membership query per event. Fine for two people; needs caching for groups. Recorded as a Phase 2 blocker. | READ |
| A-5 | `Message.readAt` models exactly one reader and cannot express a group. Blocks Phase 2. | READ |
| A-6 | `Conversation.type` is a free `String`, and `ConversationDTO` is typed `'direct'` with a single `participant`. Fine now, constrains groups. | READ |
| A-7 | The backend has **no formatter gate** (ESLint only); the Flutter side does enforce `dart format`. Deferred deliberately — see §10. | READ |

## 2. Critical bugs

All three were present in the working tree this phase inherited, all are fixed
and regression-tested, and all were reachable from ordinary use.

| ID | Bug | Impact |
| --- | --- | --- |
| **B-1** | `GET /api/conversations/:id/messages` returned **HTTP 500 on every paginated request**. The pagination cursor's timestamp field was renamed `createdAt` → `at`; `encodeCursor` and the conversation-list query were updated, but `getMessages` still read `decoded.createdAt`, so `new Date(undefined)` reached Prisma (`Target cannot be null or undefined`). | Scrolling chat history was completely broken. The first page worked, so this failed silently in review and only appeared on the *second* page. |
| **B-2** | `errorHandler` dereferenced `res.locals.requestId` unguarded, so it threw a *second* exception while handling the first. | Any unit test (or any caller) invoking the handler without a fully-populated response object crashed instead of returning 500. |
| **B-3** | `src/scripts/cleanup.ts` spread `...result` after an explicit `dryRun` key that `result` already carries (TS2783). | `npm run typecheck` failed, so **backend CI could not pass** — no PR could merge. |

A fourth defect was found by inspection rather than by a failing check: see
C-1 in §4 (a documented setting that nothing read).

## 3. High priority issues

| ID | Issue | Status |
| --- | --- | --- |
| H-1 | **`nodemailer` 6.x — 15 advisories, 1 high.** SMTP command injection, CRLF header injection, recipient-domain allow-list bypass, quadratic-complexity DoS in `addressparser`. Introduced by the SMTP password-reset work with a floating `^6.9.16`. | **Fixed** — bumped to 10.0.14 and verified rather than assumed; the entire mailer surface is pinned by tests, all of which pass unchanged. `npm audit --omit=dev`: **1 high → 0**. |
| H-2 | **CI status invisible for path-filtered PRs (F-26).** `backend.yml` and `app.yml` used `paths:`, so a docs-only PR reports *no status* for them. As required checks that is an unresolvable block, or a protection that silently does not apply. | **Fixed** — filters removed from the always-running jobs, concurrency added. |
| H-3 | **Conversation list was unpaginated (F-15)** — returned every conversation with both members and the last message, unbounded. | **Fixed** — cursor pagination, total ordering (`updatedAt` desc, `id` desc), backward compatible. |
| H-4 | **`NODE_ENV=test` disables every rate limiter and relaxes secret checks**, and nothing stopped it being set on a real deployment — which would ship an API with no auth throttling. | **Fixed** — startup refuses `NODE_ENV=test` against a non-loopback `DATABASE_URL`; unparseable URLs fail closed. |
| H-5 | **Rate-limit budgets were one shared bucket** across register/login/forgot/reset (F-12). A burst of forgot-password attempts locked *everyone* out of login, and brute-forcing login consumed the refresh budget, letting an attacker deny a client's session renewal. | **Fixed** — five independent, documented budgets. |
| H-6 | **No readiness probe (F-18)** — an instance that had lost its database still reported healthy. | **Fixed** — `GET /ready`, 503 when PostgreSQL is unreachable, with a test proving `/health` never touches the database. |
| H-7 | **No request ID / no access log (F-17).** | **Fixed** — `X-Request-Id` echoed or generated, present on every response, and in every log line including unhandled errors. |
| H-8 | **Unbounded session/token growth (F-19)** — every refresh created a `Session` row forever. | **Fixed** — idempotent, batched, conservative maintenance job with a CLI. |

## 4. Medium priority issues

| ID | Issue | Status |
| --- | --- | --- |
| M-1 | **Three documented settings that nothing read (new).** `cleanup.ts` documented `CLEANUP_BATCH_SIZE`, `SESSION_RETENTION_DAYS` and `RESET_TOKEN_RETENTION_DAYS` in its header and then called the service with only `{ dryRun }`. No schema defined them. An operator could set them and watch them be silently ignored while the job used hardcoded 500/30/30. | **Fixed** — validated in the env schema, read from validated `env`, echoed in the job output. |
| M-2 | **`trust proxy` hardcoded to `1` (F-24).** Every per-IP limiter keys on `req.ip`. One hop too many and a client spoofs `X-Forwarded-For` past the auth limiters; one too few and every user behind the proxy shares a bucket. | **Fixed** — `TRUST_PROXY`, validated as a non-negative integer. |
| M-3 | **`.env.example` carried a UTF-8 BOM and CRLF endings**, and a missing newline had merged `BCRYPT_ROUNDS=10` into the following comment block. dotenv still happened to parse it as `"10"`, so no runtime bug — but nothing protected the next editor. It also failed to document `TRUST_PROXY`, `COOKIE_PATH` or any cleanup budget. | **Fixed** — rewritten clean, every variable documented with default and required/optional status. |
| M-4 | **Presence and `lastSeenAt` are exposed to every authenticated user via REST** (F-16), contradicting the "conversation partners only" claim. The WebSocket broadcast *is* partner-scoped. | **Open — needs a decision, not code.** Gating for Phase 6 privacy/blocking. Recorded in `plan.md`. |
| M-5 | **No per-user cap on concurrent WebSocket connections**, and each `typing` frame costs a membership lookup (F-06, partially open). | **Open.** A per-socket frame budget exists; the per-user connection cap does not. |
| M-6 | **No per-*account* login rate limit** — all auth budgets are per-IP, so a botnet or a shared NAT weakens them. | **Open.** Deliberately: a shared in-memory store is correct for one instance, and a wrong per-account key risks locking out legitimate users. |
| M-7 | The password-reset claim was check-then-act (F-14): two concurrent resets with one token could both pass the `usedAt` check. | **Fixed** — single conditional `updateMany` inside an interactive transaction, so exactly one caller wins the row lock and the password write commits with it. Covered by a two-way race test. |
| M-8 | **Contract documentation contradicted the implementation** in five separate places (SMTP delivery, WebSocket expiry, refresh-token storage, missing `/ready`, conversation pagination). | **Fixed** — see §11. |

## 5. Low priority issues

| ID | Issue | Status |
| --- | --- | --- |
| L-1 | Mojibake `â†’` in a production startup error message (`config/env.ts`). | Fixed. |
| L-2 | `docs/architecture.md` still labelled the system "Alpha v0.0.1" while the repo is `v0.0.2-beta`. | Fixed. |
| L-3 | `backend/dist/` and `frontend/` are correctly gitignored; no build output is tracked. Verified. | No change needed. |
| L-4 | The contract shows JWT-shaped refresh tokens; they are opaque 96-char hex. Cosmetic, but the contract is the source of truth. | Open — low value. |

## 6. Security issues

Reviewed: authentication, authorization, input validation, ORM safety, XSS, CORS,
CSRF, rate limiting, secrets, logging, WebSocket security, error leakage,
session security.

**No new vulnerability class was introduced, and no unauthenticated access,
injection or secret-exposure path was found.** What was fixed is listed above
(H-1, H-4, H-5, M-2) plus, from earlier phases and re-verified here: HttpOnly
refresh cookie + CSRF, HS256 pinning, `jwt.verify` algorithms allowlist, timing-
equalised login via a dummy hash, LIKE-wildcard escaping in search, the 72-byte
bcrypt limit, http(s)-only avatar URLs, strict CSP/COEP headers, credentialed CORS
with no wildcard, and Prisma errors logged as type/code only (never message,
because Prisma embeds query arguments).

**Verified security properties of the WebSocket layer:** every frame is Zod-
validated before any handler sees it; a socket that does not authenticate within
5 s is closed; authorization is re-checked per frame against real membership
(`assertMember`), so an unknown conversation id is dropped silently rather than
broadcast; the socket is bound to the token's `exp` and closed with 4401 at
expiry; logout and password reset close the user's sockets through `wsHub`; there
is a per-socket frame budget and a 16 KB payload cap; malformed input produces an
error frame, not a disconnect.

### Open security items

| ID | Issue |
| --- | --- |
| S-1 | No per-user WebSocket connection cap — one valid account can open many sockets. |
| S-2 | No per-account login limit (see M-6). |
| S-3 | Presence privacy is decided per-connection, not per-field, over REST (M-4). |
| S-4 | Access tokens are stateless: an already-issued token stays valid up to 15 minutes after logout/reset on the REST path. This is a deliberate, documented trade-off, not an oversight. |
| S-5 | Rate-limit state is per-process. Acceptable for one instance; multi-instance needs a shared store. |

## 7. Performance issues

| ID | Issue | Status |
| --- | --- | --- |
| P-1 | **The test suite was flaky**, not slow — a real problem, because a red suite trains people to re-run it. Nearly every case registers a user, so bcrypt at the production cost of 10 made one hash 0.5–2.8 s against vitest's 5 s default; concurrency tests became a coin flip. | **Fixed** — tests run at `BCRYPT_ROUNDS=4` (cost is a tuning knob, not behaviour under test) with a 20 s ceiling. **124 s → 46 s, and deterministic.** |
| P-2 | `listForUser` loaded every conversation plus both members and the last message. | **Fixed** by H-3. |
| P-3 | `unreadCounts` used a single `groupBy` for the page rather than a query per conversation — correct, kept. | Verified, no change. |
| P-4 | Each `typing` frame costs 2 queries; `read` costs several. Bounded by the per-socket frame budget. | Accepted for 1:1; revisit with groups (A-4). |
| P-5 | Flutter controllers re-sort and rebuild the whole message list per frame. | **BLOCKED** — plausible cost for thousands of messages, but unmeasurable without the SDK. Measuring before changing is the correct call. |

No premature optimisation was performed.

## 8. Testing gaps

Backend is now **239 + 12 = 251** tests across 19 files, including a full
WebSocket protocol suite, auth/authorization, rate-limit bucket separation,
error-contract, security-header, secret-file, SMTP-delivery, maintenance-job and
concurrency tests. Every bug fixed in this phase has a regression test.

| Gap | Status |
| --- | --- |
| No concurrency tests (the cause of F-02/F-03 escaping) | **Closed** — races for refresh rotation, same-`clientId` send and reset-token claim are all covered. |
| No test that a real limiter returns 429 on a real route | **Closed** — plus proof that the five auth buckets are independent. |
| No `/ready`, no request-ID tests | **Closed**. |
| No test for the configuration guards | **Closed** — 12 new tests. |
| **Flutter: nothing executed.** | **BLOCKED.** Model, API-client, state, widget, localization and responsive coverage exist as files but have never been run in an environment this audit could reach. |
| No load test; no multi-instance test | Open — needs deployment. |

## 9. Documentation gaps

All closed this phase: `README.md`, `plan.md`, `docs/architecture.md`,
`docs/api-contract.md`, `backend/.env.example`. Added contract §1.4 (request ID),
§1.5 (health vs readiness), per-endpoint rate-limit budgets, and conversation
pagination. Corrected five statements that contradicted the code. Recorded the two
open decisions (presence privacy; single-reader read state) rather than inventing
answers for them.

`docs/development.md` and `docs/deployment.md` were reviewed and need no change
for the code as it now stands.

## 10. Build and release problems

| ID | Issue | Status |
| --- | --- | --- |
| B-1 | Backend CI could not pass at all (TS2783). | **Fixed.** |
| B-2 | Required-check visibility (H-2). | **Fixed.** |
| B-3 | Superseded PR runs consumed runner-minutes. | **Fixed** — concurrency groups. |
| B-4 | **No backend format gate.** The Flutter side enforces `dart format --set-exit-if-changed`; the backend has ESLint only. | **Deferred deliberately.** Introducing Prettier now would reformat every file and bury the functional changes in this phase. Recommended as its own PR with no logic changes. |
| B-5 | `flutter build windows --release` could not be run — no Dart SDK. | **BLOCKED.** The existing Windows release pipeline (build → verify `chat_app.exe`/`flutter_windows.dll`/`data/` exist → zip with a `ChatApp/` wrapper → extract and re-verify the archive) is the right shape and is already covered by `scripts/validate-artifacts.mjs`, but its current state is unverified here. |
| B-6 | Android release signing is optional; without the secret the pipeline builds a debug-signed APK and says so loudly. Documented, not a defect. | Accepted. |

## 11. Technical debt

| ID | Debt | When it must be paid |
| --- | --- | --- |
| D-1 | Single-reader read state (`Message.readAt`) | Before Phase 2 (groups) |
| D-2 | `wsHub` in-process; services call it directly instead of through a `Realtime` publisher interface | Before multi-instance (Redis) |
| D-3 | No `Realtime` abstraction, so fan-out has no seam for Redis | With D-2 |
| D-4 | `Conversation.type` free string; no member `role`/`mutedUntil`/`leftAt` | Before groups |
| D-5 | No search index — user search is `ILIKE %q%`, a sequential scan | Phase 4, chosen with `EXPLAIN` |
| D-6 | No backend formatter | Next maintenance PR |
| D-7 | In-memory rate-limit store | Multi-instance |
| D-8 | No OpenAPI/codegen; the contract is hand-maintained prose | Optional |

## 12. Recommended Phase 2 order

1. **Get Flutter evidence.** Install the SDK and run `analyze`, `test` and
   `format --set-exit-if-changed` before writing any client code. Everything
   client-side is currently unverified.
2. Settle **presence privacy (M-4)** and the **read-state model (D-1)** as
   written decisions.
3. Introduce the **`Realtime` publisher interface (D-2/D-3)** while writing group
   fan-out, before Redis is needed.
4. Per-user WebSocket connection cap (S-1) and a per-account login limit (S-2).
5. Backend formatter as a standalone no-logic PR (B-4).

## 13. Out of scope for Phase 1, by instruction

No groups, voice messages, video calls, WhatsApp, Telegram, AI agents, payments,
stories, marketplace or advanced media pipeline were added. WhatsApp integration
is Phase 6. OpenWA was not consulted as a source of architecture to copy; this
phase hardened the existing ChatApp design.