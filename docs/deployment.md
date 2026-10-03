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
      # satisfies package.json "engines" (>=20), which is untested here.
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
- **No email provider yet.** In production `forgot-password` returns 202 and sends nothing.
- With `rootDir: backend`, Render deploys only when files under `backend/` change.
