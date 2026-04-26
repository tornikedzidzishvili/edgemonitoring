# Edge Monitoring

Internal server and web application monitoring platform for Edge.

## Agent Team

Every session in this project starts with **`tech-lead-monitor`** as the main agent (configured in `.claude/settings.json`). The tech lead receives every user request, triages it, decomposes it into domain-owned tasks, and delegates to specialist subagents via the `Agent` tool. Do not do specialist work yourself when a specialist owns it — delegate.

Experimental agent teams are enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, so `TeamCreate` / `SendMessage` / `TeamDelete` are available for cross-layer work that needs teammates to coordinate directly. For most tasks, one-shot subagent dispatches are cheaper and sufficient.

### Team members (`.claude/agents/`)

| Agent | Delegate when the change touches… |
|---|---|
| `scrum-master-edge-monitoring` | Sprint planning, story breakdown, prioritization, bug triage (P0–P3), backlog grooming, timeline tracking, status reports |
| `backend-monitoring-architect` | `apps/api/src/**` — routes, auth, crypto, alerting, agent ingestion, schedulers, Plesk/SSH |
| `db-monitoring-admin` | `apps/api/prisma/**`, `src/db.ts`, `src/dataRetention.ts` — schema, migrations, indexes, retention |
| `noc-dashboard-frontend` | `apps/web/src/**` — pages, components, charts, Tailwind, dark mode |
| `enterprise-devops-engineer` | `.github/workflows/**`, `Dockerfile*`, `docker-compose*.yml`, `scripts/**`, host/TLS config |

### Routing contract

- **Plan / prioritize / scope first** (non-trivial work): consult `scrum-master-edge-monitoring` *before* dispatching specialists. The scrum master produces stories with acceptance criteria, severity/priority, sizing, and dispatch order. The tech lead then dispatches specialists per that plan and owns Jira transitions.
- **Cross-layer change** (e.g. new feature touching API + UI + schema): dispatch specialists **in parallel** in a single message, then synthesize.
- **Single-layer change**: dispatch the one owning specialist directly.
- **Verification / Playwright / curl checks**: the tech lead runs these itself after delegated work completes.
- **Triage reads** (git status, small file reads to understand scope): the tech lead does these itself before delegating.
- **Unclear ownership**: use `AskUserQuestion` rather than guessing.

### Jira tracking (live status surface)

The tech lead is responsible for keeping Jira in sync with reality so the user sees progress without delays.

- **Project key**: `EMS`
- **Workflow statuses**: `To Do` → `Selected for Development` → `In Progress` → `Code Review` → `Done`
- **Bot account**: `nova@edge.ge` — the agent system's Scrum Master persona ("Nova"). All Jira writes (issue creation, comments, transitions) happen as Nova. Assignee defaults to Nova.
- **Human contact**: `tornike@edge.ge` — only `@`-mention in a Jira comment when explicit human input/approval is required. Default communication channel is the Claude Code chat, not Jira comments.
- **Transition contract** (tech lead owns these via Jira MCP):
  - When the scrum master finalizes a story → ensure an EMS issue exists, status `Selected for Development`, sprint set, summary + acceptance criteria written.
  - When the tech lead dispatches the work to a specialist → transition to `In Progress`, add a comment naming which specialist agent picked it up plus a 1-line plan.
  - When the specialist returns work and the tech lead is verifying → transition to `Code Review`.
  - After tech-lead verification passes → transition to `Done`.
  - If a specialist reports a blocker → comment the blocker on the issue and notify the user in chat; keep status at `In Progress` until resolved.
- **Bug severity** (set by scrum master): P0 / P1 / P2 / P3 — recorded in the issue summary or a labeled field. P0/P1 take priority over in-flight Selected for Development work.

### Maintenance

- Keep each specialist's `description` field sharp — auto-delegation depends on it. Use "USE PROACTIVELY" / "MUST BE USED" language and list concrete file paths.
- `.claude/settings.json` pins the lead and enables the experimental flag — keep it checked into the repo so the team has the same orchestration setup.
- User-level agents in `~/.claude/agents/` override project ones if names collide. Project scope is authoritative for this repo.

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
- `appleboy/scp-action@v1`
- `appleboy/ssh-action@v1.2.5`

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

## Monitoring Modes

Edge Monitoring supports three ways of collecting data from a target host. The mode is selected per-server (or per-shared-hosting-server) when the operator adds it; downstream dashboards, alerts, and retention behave the same regardless of mode because all metrics flow into the same `ServerReport` / `ServerMetricMinute` tables.

### `monitoringMode` enum on `Server`

Defined in `apps/api/prisma/schema.prisma`:

| Value | Description |
|---|---|
| `agent` | Default. Server runs the Dockerized agent (`apps/agent`) which pushes metrics to `POST /agents/report` using an `X-Agent-Key` header. Original ingestion path. |
| `ssh` | Server is polled agentlessly over SSH every 60s by `startSshPollScheduler` (`apps/api/src/services/sshPollScheduler.ts`). No agent install on the host. Cadence is configurable via `SSH_POLL_INTERVAL_MS`. |
| `cyberpanel` | Reserved on `Server`. Per-server CyberPanel monitoring is handled today via the separate `SharedHostingServer` flow (see below) rather than this enum value. Documented for completeness so future work doesn't re-introduce the same enum value. |

### Adding an SSH-polled server

1. Settings → SSH Keys → upload the private key. The key (and optional passphrase) are encrypted at rest with AES-256-GCM via `src/cryptoBox.ts`; master secret is `SSH_KEY_MASTER_SECRET`.
2. Servers → Add Server → set **Monitoring Mode** to `ssh`, pick the uploaded key from the dropdown, save.
3. On the saved server, click **Test Connection** to verify the API can reach the host and run a sample probe before the scheduler picks it up.

### Adding a CyberPanel-type SharedHostingServer

CyberPanel inventory (websites, SSL expiry, control-plane service health) is a distinct flow from per-server metrics.

1. Settings → Shared Hosting Servers → Add → **Type = CyberPanel**. Server credentials are encrypted at rest the same way as SSH keys.
2. The host is polled by `startSharedHostingSyncScheduler` (`apps/api/src/scheduler.ts`), which delegates to `syncCyberPanel` (`apps/api/src/services/cyberpanelSync.ts`).
3. Per cycle, the sync runs:
   - `cyberpanel listWebsites --json` (falls back to plain text) — populates the website inventory
   - `systemctl is-active lscpd lsws mariadb` — server-wide control-plane snapshot
   - `openssl x509 -enddate -noout -in <certPath>` per site — SSL expiry
4. Service-health alerts fire after **2 consecutive `inactive` cycles** for a given service (LSCPD, LSWS, MariaDB) — debounces transient `systemctl` blips.
5. **Minimum tested CyberPanel CLI version**: `[TBD — confirm with first production install]`.

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
