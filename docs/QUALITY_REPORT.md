# ChatApp Quality Report

**Repository:** `MOT1209/chatapp` · **Branch:** `claude/ecstatic-euler-4zdog1` · **Baseline:** `86680f1` (end of Phase 1)

**Overall status: NOT READY for production. READY for a controlled beta on web and Linux.**
The things that were broken in the code that ships are fixed and tested. What blocks "production" is
mostly what could not be verified here (Android, Windows, macOS, real devices, Firefox/Edge) and
decisions only a person can take (presence privacy, read model for groups). See *Remaining issues*.

## How to read this report

Every claim carries one of these. Nothing is marked PASS on the strength of reading code alone.

| Tag | Meaning |
| --- | --- |
| **VERIFIED** | Executed here and observed: a test run, a build, or a real browser session. |
| **MUTATION-CHECKED** | A new test that was made to fail by breaking the code it protects, then restored. |
| **NOT VERIFIED** | Could not be run here. Stated, not assumed. |

Environment: Node 22.22, PostgreSQL 16, Flutter 3.47.6 / Dart 3.13.5 (CI pins 3.47.5), Chromium via Playwright.

## Quality gate

| Gate | Result |
| --- | --- |
| Backend `npm ci` from clean, `prisma validate` (with `DATABASE_URL` set, as CI does) | PASS |
| Backend typecheck | PASS |
| Backend lint | PASS |
| Backend tests (real PostgreSQL) | PASS — 312 / 312, run three times in a row |
| Backend build | PASS |
| `npm audit` (all dependencies) | PASS — 0 vulnerabilities (was 6: 1 critical, 1 high, 4 moderate) |
| Flutter `dart format --set-exit-if-changed` | PASS (was failing on 8 files) |
| Flutter `analyze` | PASS — no issues |
| Flutter tests | PASS — 378 / 378 |
| Release-script tests (`node --test`) | PASS — 19 / 19 |
| Web build (`--release --no-web-resources-cdn`) | PASS |
| Linux build (`--release`) | PASS — binary produced. The app was **not launched**. |
| Real-browser scenario, Chromium, built web app + real backend | PASS — 19 / 19 checks |
| Android build | **NOT VERIFIED** — `dl.google.com` is blocked, so no Android SDK can be downloaded here |
| Windows build | **NOT VERIFIED** — needs Windows |
| macOS build | **NOT VERIFIED** — needs macOS |
| Firefox, Edge | **NOT VERIFIED** — only Chromium is installed |
| Real devices (any platform) | **NOT VERIFIED** |

"NOT VERIFIED" is not "PASS". CI builds Android/Windows/macOS, but none of those jobs were run for this report.

## P0 — critical

| ID | Finding | Fix | Evidence |
| --- | --- | --- | --- |
| P0-1 | `start-server.bat` wrote the **same JWT secrets, committed to the repo,** into every install, for a server whose CORS allowed a LAN address. Anyone on the LAN who had read the repo could forge an access token for any user. | Random 384-bit secrets per machine (`src/scripts/local-env.ts`). | VERIFIED on Linux (see below) + 9 unit tests |

## P1 — high

| ID | Finding | Fix | Evidence |
| --- | --- | --- | --- |
| P1-1 | **The emailed password-reset link did nothing.** The backend mails `<APP_BASE_URL>/reset-password?token=…`; the app never read the URL, so it opened Login and the token was lost. | `resetTokenFromUri`; the reset step opens with the code pre-filled. Single-page-app fallback documented as a hosting requirement. | VERIFIED in Chromium: link opens the reset step, completes, old password rejected, link single-use. Unit + widget tests. |
| P1-2 | **Refresh-token reuse signed users out everywhere.** Two browser tabs share one refresh cookie; the loser of a refresh race looked like theft and revoked every session. | `REFRESH_REUSE_GRACE_SECONDS` (default 10): a just-rotated token is refused without revoking; later reuse still revokes all. Client adopts a token another tab stored instead of clearing it. | MUTATION-CHECKED (server and client) |
| P1-3 | **500 on bad input.** A lone UTF-16 surrogate (an emoji cut in half) or a NUL byte in any text field, a body over 1 MB, an unsupported content-encoding and an undecodable path escape all returned `SERVER_ERROR`. | Middleware rejects unstorable text with 400; body-parser errors map to 413/415/400; all in the standard envelope. | 14 tests, written first, 12 failed before the fix |
| P1-3b | **Secret loader crashed on unrelated variables.** `loadSecretFiles` scanned every `*_FILE` env var (`SSL_CERT_FILE`, …) and aborted startup when one was unreadable. 19 test files failed in a stock container. | Allowlist of the five real secrets. | VERIFIED: 19 failing files → 0 |
| P1-4 | **`dart format` gate was red** (8 files, several without a trailing newline), so the app CI job could not pass. | Formatted. | VERIFIED |
| P1-5 | **Tablet layout collapsed.** At 600–719 px the chat pane was 218 px wide; bubbles, header and composer broke at larger text sizes. The time/status row under each bubble overflowed by up to 83 px. | One pane at a time below 720 px; `Flexible` time row. | MUTATION-CHECKED; 26 sweep failures → 0 |
| P1-6 | **The default web build contacts `gstatic.com`** for CanvasKit and fonts: every visitor's IP goes to Google (a data-protection problem for a German-language app), it fails on restricted networks, and it cannot start at all if the CDN is unreachable. | `--no-web-resources-cdn` in CI, release, root script, README. | VERIFIED: a Chromium run contacts only `localhost` |
| P1-7 | **Deployment doc produced a service that cannot start.** The Blueprint omitted `SMTP_*` and `APP_BASE_URL`, which production requires, and a bullet still said no mail is sent. | Env vars and text corrected. | Read against `config/env.ts` |

## P2 — medium

| ID | Finding | Fix | Evidence |
| --- | --- | --- | --- |
| P2-1 | WebSocket abuse (open items S-1/M-5): unlimited sockets per account, no budget for non-DB frames, unbounded outbound buffering for a reader that never reads. | `WS_MAX_CONNECTIONS_PER_USER` (default 10, newcomer refused with 4429, never evict), 200 frames/10 s/socket, 1 MiB backlog drop. | MUTATION-CHECKED ×3 |
| P2-2 | Reset links (a credential) were printed to the console in every development run. | Opt-in `DEV_LOG_RESET_TOKEN`; production refuses to start with it. | MUTATION-CHECKED |
| P2-3 | Six catch sites logged `err.message` directly; Prisma messages embed query arguments. | Routed through `describeError`. | Read only; no dedicated test |
| P2-4 | `start-server.bat` also overwrote `.env` each run, built an invalid URL for passwords containing `@ : / % #`, and used the shared `postgres` database (the cause of `prisma migrate deploy` P3005). | Existing `.env` kept, URL-encoded password, dedicated `chatapp` DB. | VERIFIED on Linux with password `p@ss:w/rd%&#?`. **The .bat itself NOT VERIFIED** (no Windows). |
| P2-5 | Dev-tooling advisories (Vitest, Vite, esbuild). | Vitest 5 + Vite 7 (`poolOptions` removal handled: `fileParallelism: false`; Node ≥ 22.12). | VERIFIED: `npm audit` 0, 12 tests that broke under the new runner fixed |
| P2-6 | Dependabot covered only GitHub Actions. | Added npm (backend, root) and pub (app). | YAML parses; **not validated against GitHub** |
| P2-7 | Test isolation: a test read the developer's own `backend/.env`. | Pinned `SMTP_HOST` in the test. | VERIFIED |
| P2-8 | Test coverage gaps: pagination under timestamp ties, the second half of the E2E journey, software keyboard, auth screens, German, 2.0× text, dark mode, 600/900/1023/1024 px. | +61 backend tests, +228 Flutter tests. | See below |
| P2-9 | Stale documentation contradicted the code: changelog described a Resend mailer that does not exist, `README`/docs claimed "any variable accepts `_FILE`", `.nvmrc` mentioned but absent, Node ≥ 20. | Corrected. | Read against code |

## P3 — low

| ID | Finding | Status |
| --- | --- | --- |
| P3-1 | Presence dot used a fixed `right:`; did not mirror in RTL. | Fixed, MUTATION-CHECKED |
| P3-2 | Reset step showed the first step's subtitle ("enter your email…"). Found from a real screenshot. | Fixed (en/ar/de) |
| P3-3 | Mojibake `â†’` in a startup error; literal `—` in a Dart comment. | Fixed |
| P3-4 | `Conversation(updatedAt)` index is never used by the list query (EXPLAIN on 100 k conversations: 0.18 ms via the membership index). | **Left.** Cost ≈ 8 % on bulk updates; the "prevents HOT updates" theory was **not demonstrated** (the measurement was confounded). Not worth a migration. |
| P3-5 | Wrong HTTP method on a known route answers 404, not 405. | Left |
| P3-6 | Message delete has no keyboard path (long-press / right-click only). | Left |
| P3-7 | Client message limit counts characters; server counts UTF-16 code units, so ~4000 emoji pass the client and are refused. | Left |
| P3-8 | `cupertino_icons` is declared but never imported. | Left (negligible gain, non-zero risk) |

## Area by area

**Backend / API contract.** Inspected every route, controller, service, validator. Layering is sound (no
business logic in routes, no circular imports). 15 hostile requests probed against a running server; every
one now answers in `{error:{code,message[,fields]}}`. Contract §1.2 updated for 413/415 and unstorable text.

**Database.** Idempotent send via `(senderId, clientId)` with the `P2002` race handled; atomic reset-token
claim; no N+1 found. Cursor pagination walked at limits 1/7/30/100 over 150 messages sharing 4 timestamps and
45 conversations sharing one `updatedAt`: no duplicate, gap or reorder (MUTATION-CHECKED). The index analysis
above is measured, not assumed.

**Authentication.** bcrypt password hashing, hashed refresh tokens, rotation, reuse detection, CSRF for the cookie
path, single-use reset tokens, equalised login timing: inspected and covered by tests. Fixed P1-2, P2-2.
Open: no per-account login limit (budgets are per IP).

**WebSocket.** Authentication in the first frame, per-frame membership checks, token-bound lifetime, per-socket
budgets, and now P2-1. Open: the hub is in-process (one instance only).

**Flutter / UI / UX.** Existing architecture kept. Sweep: 13 window sizes × en/ar/de × text 1.0/1.5/2.0 ×
light and dark, plus the signed-out screens. Real screenshots reviewed at 390, 820 and 1440 px, in English,
Arabic (RTL mirrored correctly: title, icons, FAB, bottom bar, digits) and German.

**Responsive.** Phone, tablet (one pane < 720 px, two panes from 720), desktop (rail + list + chat). The
software-keyboard test keeps the composer above a 300 px keyboard on 360×640, 390×844, 412×915.
Caveat: Flutter tests use the Ahem font (every glyph one em wide), which overstates text widths by roughly 1.5×.

**Localization.** 123 keys, identical in en/ar/de (checked mechanically); Arabic plurals use `=1`/`=2`/`few`/`other`.
No hard-coded UI strings found by scanning `lib/ui` (a scan, not a proof).

**Security.** Tracked files scanned for key/token patterns and private-key headers: none. Git history scanned for secret-like *file names* only (`.env`, keys, keystores): none; history contents were not scanned. Findings above. Not done:
penetration testing, load testing, license review.

**Performance.** Measured the list query (EXPLAIN, 100 k rows). Nothing else was optimised without a measurement.
No load test.

**CI/CD.** No `continue-on-error`; no `paths:` filter hiding checks. Order is install → audit → generate → validate →
migrate → typecheck → lint → test → build. Web build now matches what ships. Not done: a backend formatter
(deliberately deferred in Phase 1).

## Files changed and tests added

See `git log 86680f1..HEAD` (about 70 files). New test files: `pagination-stress`, `realtime-limits`,
`input-hardening`, `e2e-lifecycle`, `local-env` (backend); `reset_link`, `auth_screens_sweep`, `user_avatar`
(Flutter), plus extended `secrets`, `auth`, `security`, `app_test`, `api_client_test`, `viewport_sweep`.
Backend 251 → 312, Flutter 150 → 378 (251 is what Phase 1 left: its 239 plus 12 configuration-guard tests).

## Real-browser scenario (Chromium, built web app, real backend and PostgreSQL)

Not committed to the repository (it drives Flutter's accessibility tree and needs a Playwright install);
it passed 19 / 19 on the final build:
sign in through the UI · conversation list and preview · no refresh token in `localStorage` ·
refresh cookie `chatapp_rt` is `HttpOnly`, `SameSite=Lax`, `Path=/api/auth` · cookie invisible to
`document.cookie` · **page reload keeps the session** · authenticated WebSocket · message typed in the
UI reaches the other user · reset link opens the reset step · reset completes · old password rejected, new
works · link cannot be reused · signed-in screen renders without errors at 820, 1440, Arabic and German.
It also showed the real rate limiter answering `429` with `Retry-After` once its budget was spent.

## Remaining issues

1. **Android, Windows, macOS builds and real-device testing: NOT VERIFIED.** Firefox/Edge NOT VERIFIED.
2. **Presence privacy (F-16)** and the **read model for groups (A-5)** need a decision, not code.
3. **No per-account login limit;** all limits and the WebSocket hub are per process (single instance only).
4. **No automated browser test in CI.** The scenario above ran by hand.
5. The `.bat` and the Dependabot file could not be run against Windows / GitHub.
6. P3-4 … P3-8 above.

## Recommended next phase

1. Run the existing CI on a PR so Android, Windows and macOS actually execute; fix whatever it finds.
2. Turn the Chromium scenario into a CI job (build web, start backend, drive it), reusing `--no-web-resources-cdn`.
3. Decide presence privacy and the read model; only then start groups.
4. Per-account login throttling and a shared store for limits and the hub, before a second instance.
5. Try the app on at least one real phone and one real Windows machine.
