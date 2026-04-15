# Edge Monitoring

Internal server and web application monitoring platform for Edge.

## Architecture

Monorepo with npm workspaces. Three apps:

- **apps/api** — Fastify REST API + Prisma ORM + SQLite. Handles server metrics ingestion, uptime checks, domain monitoring, alerting (email/SMS), shared hosting (Plesk) integration.
- **apps/web** — React 18 + Vite + Tailwind CSS dashboard. SPA served by nginx in production.
- **apps/agent** — Lightweight Node.js agent deployed on monitored servers. Reports system metrics (CPU, memory, disk, Docker) to the central API.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 (Alpine Docker images) |
| API framework | Fastify 5 |
| ORM | Prisma 6 (SQLite) |
| Frontend | React 18, Vite, Tailwind CSS 3, Recharts, Framer Motion |
| Auth | Session-based (Bearer tokens), WebAuthn/Passkeys, TOTP 2FA |
| Encryption | AES-256-GCM for secrets at rest (SSH keys, SMTP passwords, API keys) |
| Email | Nodemailer |
| SMS | smsoffice.ge API |
| Deployment | GitHub Actions -> GHCR -> Docker Compose on single server |
| Domain | monitoring.edge.ge |
| TLS | Let's Encrypt via Certbot |

## Development

```sh
npm ci                          # Install all workspace dependencies
npm run dev:api                 # Start API with tsx watch (port 4000)
npm run dev:web                 # Start Vite dev server (port 5173)
npm run typecheck               # Typecheck all workspaces
npm run build                   # Build all workspaces
```

API requires `.env` in `apps/api/` — copy from `.env.example`.

## Database

SQLite via Prisma. Schema at `apps/api/prisma/schema.prisma`.

```sh
cd apps/api
npx prisma migrate dev          # Create/apply migrations locally
npx prisma generate             # Regenerate client after schema changes
npx prisma studio               # Browse data in browser
```

Production runs `prisma migrate deploy` automatically on container start.

### Data Retention

Automatic cleanup runs every 6 hours (see `src/dataRetention.ts`):
- 30 days: UptimeCheckResult, DomainCheckResult, ServerReport, ServerMetricMinute
- 90 days: resolved ServerAlert records

### SQLite Pragmas (applied at startup in `src/db.ts`)

WAL mode, synchronous=NORMAL, busy_timeout=5000ms, 20MB page cache.

## CI/CD Pipeline

Push to `main` triggers: **CI (typecheck + build)** -> **Build Docker images (GHCR with Buildx cache)** -> **Deploy (pull images, compose up, health check, auto-rollback on failure)**.

PRs to `main` trigger CI only.

## Version Policy

**Always use the latest stable versions.** This project must stay current — do not pin to old majors when newer stable releases exist.

### GitHub Actions

Use the latest major version tags. As of this writing:
- `actions/checkout@v5`
- `actions/setup-node@v5`
- `actions/cache@v5`
- `docker/login-action@v4`
- `docker/setup-buildx-action@v4`
- `docker/build-push-action@v7`
- `appleboy/scp-action@v0.1.8`
- `appleboy/ssh-action@v1.2.1`

When GitHub announces deprecation warnings for Node.js versions in Actions, bump action versions immediately.

### Node.js

Use the current LTS version (22.x). Specified in:
- `engines` field in root `package.json`
- All `Dockerfile` files (`FROM node:22-alpine`)
- CI workflow (`setup-node` step)

### npm Dependencies

Keep dependencies on their latest stable versions. Key packages and their minimum expected versions:

**API (apps/api)**
- `fastify` >= 5.x
- `@prisma/client` + `prisma` >= 6.x
- `nodemailer` >= 8.x (v6 is deprecated)
- `undici` >= 8.x
- `zod` >= 4.x
- `@simplewebauthn/server` >= 13.x

**Web (apps/web)**
- `react` + `react-dom` 18.x (evaluate React 19 when ecosystem is ready)
- `vite` >= 6.x
- `tailwindcss` 3.x (evaluate Tailwind 4 when plugin ecosystem catches up)
- `recharts` >= 2.x
- `framer-motion` >= 12.x

**Agent (apps/agent)**
- `systeminformation` >= 5.x
- `dockerode` >= 4.x

Run `npm outdated` periodically in each workspace and update.

### Dockerfiles

Use `node:22-alpine` for build and runtime stages. Bump when Node LTS advances.

## Security

### Authentication
- All data/admin routes are protected by session auth via the route guard plugin (`src/plugins/routeGuard.ts`)
- Admin routes (`/admin/*`) require admin role
- Agent reporting uses X-Agent-Key header with SHA-256 hashed keys
- Rate limiting via `src/plugins/rateLimiter.ts` (10/min auth, 120/min agents, 100/min general)
- Fail-closed: unclassified routes return 403

### Encryption at Rest
All secrets use AES-256-GCM with the `enc/iv/tag` triple pattern (see `src/cryptoBox.ts`):
- SSH private keys and passphrases
- SMTP passwords
- SMS API keys
- Shared hosting server credentials

Master key: `SSH_KEY_MASTER_SECRET` env var (min 16 chars).

**Never store passwords or API keys in plaintext.** Always use `encryptString()`/`decryptString()` from `cryptoBox.ts`.

### When Adding New Routes
1. Classify the route in `src/plugins/routeGuard.ts` (admin, authenticated, or public)
2. If you skip this, the fail-closed default returns 403 — this is by design

## Project Conventions

- TypeScript strict mode, ES modules (`"type": "module"`)
- Zod for all request validation (params, query, body)
- Prisma for all database access — no raw SQL except pragmas
- Fastify plugins for cross-cutting concerns (auth, rate limiting)
- Route files in `src/routes/` use `preHandler` for auth; routes in `src/index.ts` are protected by the global route guard plugin
- Secrets in `.env` files, never committed. Use `.env.example` as template.

## Deployment

Production server: `monitoring.edge.ge` (46.224.152.2)
- SSH user: `edge` (deploy), `root` (admin)
- App directory: `/opt/edge-monitoring`
- Data volume: `api_data` Docker volume at `/data/edge-monitoring.db`
- Proxy: nginx:alpine with swappable HTTP/HTTPS configs via `PROXY_CONF` env var
- TLS: Let's Encrypt certs auto-renewed via cron (twice daily)

### Manual Deploy (if needed)
```sh
IMAGE_TAG=sha-<commit> SSH_KEY_MASTER_SECRET=<secret> ./scripts/deploy-prod.sh
```
