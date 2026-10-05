# Deployment

**Status: postponed.** The Render Blueprint (`render.yaml`) was removed from the repository
on purpose; the backend is not deployed anywhere. Nothing in CI or the apps depends on it.

## Resuming later (Render)

1. In the Render dashboard, delete every older `chatapp*` service, `chatapp-db` database and the
   old chatapp Blueprint first (earlier attempts lived in Oregon, in two workspaces). Otherwise
   an old Blueprint can sync new settings onto old resources, and a database cannot change region.
2. Restore `render.yaml` at the repository root with the content below, merge it to `main`.
3. Render → **New** → **Blueprint** → this repository (branch `main`). It needs a payment method:
   the plans are paid on purpose (free web services sleep and drop WebSockets; free databases
   expire after 30 days and their data is deleted).
4. Set the GitHub Actions variables `API_URL` (`https://<host>`) and `WS_URL` (`wss://<host>/ws`),
   then run the release workflow so the apps point at the server.

```yaml
# Render Blueprint for the ChatApp backend (API + WebSocket + PostgreSQL).
# Dashboard: New -> Blueprint -> select this repository. See docs/deployment.md.
#
# Single instance only: the realtime hub is in-memory (docs/architecture.md).
# Do not raise numInstances above 1.
#
# Region: Frankfurt, closest to the Arabic- and German-speaking users. A database
# cannot change region after it is created, and the service must be in the same
# region to reach it over the internal network (otherwise P1001, docs/deployment.md).
databases:
  - name: chatapp-db
    databaseName: chatapp
    user: chatapp
    region: frankfurt
    # Free databases expire after 30 days and their data is deleted.
    plan: basic-256mb
    # No public access: only services in the same Render region/workspace connect,
    # over the internal network.
    ipAllowList: []

services:
  - type: web
    name: chatapp-api
    runtime: node
    rootDir: backend
    region: frankfurt
    # Free services sleep after ~15 idle minutes and drop every WebSocket; a chat
    # backend must stay up.
    plan: starter
    numInstances: 1
    # typescript and prisma are devDependencies and are needed at build time and for
    # `prisma migrate deploy`, so dev dependencies must be installed even though
    # NODE_ENV=production.
    buildCommand: npm ci --include=dev && npx prisma generate && npm run build
    # Migrations run on start (single instance, so no migration race) instead of relying
    # on a pre-deploy command.
    startCommand: npx prisma migrate deploy && node dist/server.js
    healthCheckPath: /health
    autoDeployTrigger: commit
    branch: main
    envVars:
      # Pin the Node major that CI tests. Without this Render picks the newest Node that
      # satisfies package.json "engines" (>=22.12), which is untested here.
      - key: NODE_VERSION
        value: '22'
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: chatapp-db
          property: connectionString
      # Production refuses to boot unless these are >= 32 chars and different.
      - key: JWT_ACCESS_SECRET
        generateValue: true
      - key: JWT_REFRESH_SECRET
        generateValue: true
      # Only needed if a browser (web) client is hosted; native apps send no Origin.
      # Comma-separated origins, e.g. https://chat.example.com
      - key: CORS_ORIGIN
        sync: false
      # The web client's origin, https only (production refuses http). It is the base of the
      # emailed password-reset link, so it must be where the web build is hosted.
      - key: APP_BASE_URL
        sync: false
      # Outbound mail for password reset. Production refuses to boot without a transport, so
      # these are required: any SMTP provider works. SMTP_USER and SMTP_PASS go together.
      - key: SMTP_HOST
        sync: false
      - key: SMTP_PORT
        value: '587'
      - key: SMTP_FROM
        sync: false
      - key: SMTP_USER
        sync: false
      - key: SMTP_PASS
        sync: false
      - key: BCRYPT_ROUNDS
        value: '10'
```

## Lessons from the first attempts

- **Create services only from the Blueprint.** Hand-made services ignore `rootDir: backend` and
  build the repo root (`yarn build`, `TS2688: Cannot find type definition file for 'node'`).
- **Database and service in the same region.** The internal hostname `dpg-...-a` only resolves in
  its own region; a mismatch gives `P1001: Can't reach database server`.
- **Pin Node 22** (`NODE_VERSION`), the version CI tests; otherwise Render picks the newest Node.
- **Single instance only.** The realtime hub is in-memory (see [architecture](./architecture.md)).
- **An SMTP provider is required.** Production refuses to start without `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` and an `https://` `APP_BASE_URL` (backend `config/env.ts`); `forgot-password` always answers 202 and the link is delivered by SMTP.
- With `rootDir: backend`, Render deploys only when files under `backend/` change.

## Hosting the web build

The web client is a static bundle (`flutter build web --release --no-web-resources-cdn`, output in
`app/build/web`). Two requirements for whatever serves it:

- **Rewrite unknown paths to `index.html`** (a single-page-app fallback; requests for a path with a
  file extension, such as `/missing.js`, should still 404). The password-reset email links to
  `<APP_BASE_URL>/reset-password?token=…`, which is a route inside the app, not a file; without the
  rewrite that link returns 404 and the reset can never be completed from the email.
- Serve it from the origin in `APP_BASE_URL` and list that origin in the backend's `CORS_ORIGIN`.

`--no-web-resources-cdn` is deliberate. Without it the app fetches CanvasKit and its fonts from
`gstatic.com` on every first visit, which sends each visitor's IP address to Google, fails on a network
that blocks it, and cannot be covered by a strict `Content-Security-Policy`. With it the bundle is larger
(about 42 MB on disk, of which a browser downloads one ~7 MB CanvasKit variant) and the app contacts only
its own origin and the API; this was checked in Chromium by recording every host the page contacts.
