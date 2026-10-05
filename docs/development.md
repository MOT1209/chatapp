# Development guide

## Prerequisites

- Node.js ≥ 22.12 (the backend test runner, Vitest 5, requires it; CI uses 22)
- Flutter ≥ 3.47 (stable) for the client, plus the platform toolchain you target (Android SDK, Xcode, Visual Studio, or GTK dev libraries on Linux)
- npm ≥ 10
- PostgreSQL ≥ 14 running locally (or a reachable `DATABASE_URL`)
- Git

## First-time setup

```bash
git clone <repo-url>
cd chatapp

# Backend
cd backend
npm install
cp .env.example .env
# edit .env — set DATABASE_URL, JWT secrets
npm run prisma:generate
npm run prisma:migrate   # creates initial migration
cd ..

# App
cd app
flutter pub get
cd ..
```

## Running the app

Two terminals is the simplest path:

```bash
# terminal 1
cd backend && npm run dev

# terminal 2 — web on :5173 matches the backend's default CORS_ORIGIN
cd app && flutter run -d chrome --web-port 5173
```

Or from the repo root (installs root + backend dependencies and runs `flutter pub get`):

```bash
npm run install:all
npm run dev            # runs both in parallel
```

## Common commands

Backend, from `backend/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with reload |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |

Backend adds Prisma commands: `prisma:migrate`, `prisma:generate`, `prisma:studio`.

App, from `app/`: `flutter run`, `flutter analyze`, `flutter test`, `dart format lib test`,
`flutter build <platform>`. See [`app/README.md`](../app/README.md).

## Environment variables

### App (`--dart-define` at build/run time)

| Variable | Purpose |
| --- | --- |
| `API_URL` | REST base URL, default `http://localhost:4000` |
| `WS_URL` | WebSocket URL, default `ws://localhost:4000/ws` |

### Backend (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` / `test` / `production` |
| `PORT` | HTTP port (default `4000`) |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | HMAC secret for access tokens. Production rejects short values, known placeholders (`secret`, `change-me`, …), or a value identical to `JWT_REFRESH_SECRET` — the server won't start. development/test allow short, obviously-fake values |
| `JWT_REFRESH_SECRET` | HMAC secret for refresh tokens. Same production requirement as above |
| `JWT_ACCESS_TTL` | Access token TTL (default `15m`) |
| `JWT_REFRESH_TTL` | Refresh token TTL (default `30d`) |
| `BCRYPT_ROUNDS` | bcrypt cost factor for password hashing (default `10`) |

**Never commit `.env`.** `.gitignore` already blocks it — double-check `git status` before every push.

## Verifying the setup

```bash
# Backend health check
curl http://localhost:4000/health
# → {"status":"ok","service":"chatapp-api"}

# Prisma schema is valid
cd backend && npx prisma validate
```

## Backend tests need a second database

Backend tests run against a real PostgreSQL database, not mocks:

```bash
createdb chatapp_test   # or: psql -c "CREATE DATABASE chatapp_test;"
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chatapp_test?schema=public" \
  npx prisma migrate deploy
npm test
```

`backend/vitest.config.ts` points tests at `chatapp_test` regardless of your own
`.env` — see that file for details. CI creates this database automatically via a
Postgres service container.

## Testing before pushing

Backend:

```
npm run typecheck && npm run lint && npm test && npm run build
```

App:

```
dart format --set-exit-if-changed lib test && flutter analyze && flutter test
```

CI runs the same set. If it fails locally, it will fail there.

## Releases (Web, Android APK, Windows, Linux, macOS)

`.github/workflows/release.yml` builds the downloadable clients. iOS is **not** built yet
(needs code signing).

| Artifact | File |
| --- | --- |
| Web | `chatapp-web-<tag>.zip` (static bundle) |
| Android | `chatapp-android-<tag>.apk` |
| Windows | `chatapp-windows-x64-<tag>.zip` (unzip, run `chat_app.exe`) |
| Linux | `chatapp-linux-x64-<tag>.tar.gz` (extract, run `chat_app`; needs the GTK/libsecret runtime libraries present on most desktop distros) |
| macOS | `chatapp-macos-<tag>.zip` (unzip the `.app`; unsigned and not notarized, so Gatekeeper refuses a normal double-click — right-click → Open → Open anyway, or `xattr -dr com.apple.quarantine` the `.app` first) |

- **Dry run (no release):** Actions → *release* → *Run workflow*. Optionally pass `api_url` / `ws_url`. Artifacts are attached to the run.
- **Real release:** push a tag such as `v0.0.2-beta`. The workflow creates a **draft** GitHub Release with all five files and `SHA256SUMS.txt`; a person must click *Publish*. Tags containing `-` are marked pre-release.
- **Version:** the tag's `x.y.z` prefix becomes the Flutter build-name (`app/pubspec.yaml`'s own `version:` is a local dev default, currently `0.0.2+2`, and isn't what ships — the workflow always derives the real build-name/number from the tag and run number). A tag like `v0.0.2-beta` builds name `0.0.2`; the `-beta` suffix only marks the GitHub Release as a pre-release.
- **Backend URL:** set repository variables `API_URL` (e.g. `https://api.example.com`) and `WS_URL` (e.g. `wss://api.example.com/ws`). A **tag** build requires them, requires `https:///`wss://`, and rejects loopback — it fails rather than shipping a client that can only reach `localhost`. A manual dispatch may still use `localhost` for a dry run.
- **Android signing:** configure secrets `ANDROID_KEYSTORE_BASE64` (the keystore file), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` and the APK is release-signed. Without them it falls back to a CI debug key and says so in the release notes; tick `require_release_signing` on a manual dispatch to make a missing key a hard failure instead. No key material is ever committed.
- **Limitations:** without the signing secrets the APK is debug-signed (sideload only; cannot be updated in place; not Play Store ready). Windows, Linux and macOS builds are all unsigned (SmartScreen/Gatekeeper warn) and are portable archives, not installers/packages. Builds are compile-checked only, not tested on real devices.
- **Backend hosting:** postponed; `render.yaml` was removed. [deployment.md](./deployment.md) has the Blueprint to restore and the `API_URL` / `WS_URL` steps.
