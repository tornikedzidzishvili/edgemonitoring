---
name: Schema audit findings — April 2026
description: Known schema weaknesses and N+1 patterns found during the April 2026 audit
type: project
---

Key findings from full schema + query audit (2026-04-15):

**Critical — missing indexes:**
- `Server.apiKeyHash` has no index; every agent report does a full table scan via `findFirst({ where: { apiKeyHash } })`.
- `UptimeCheckResult.ok` has no index; the `/failures` and `/dashboard` `recentFailures` queries filter on `ok: false` cross the entire table.

**Critical — missing cascade delete on WebApp → UptimeCheckResult:**
- Schema FK is `onDelete: Restrict` (implicit default). Deleting a WebApp via DELETE /admin/webapps/:id will error at the DB level unless UptimeCheckResults are deleted first. The server-delete path works around it manually; the webapp-delete path does not.

**Warning — N+1 patterns in index.ts:**
- GET /webapps: `Promise.all(webapps.map(...))` fires 5 queries per webapp (lastCheck + 4 counts).
- GET /shared-hosting/:id: fires 3 queries per domain (lastCheck + 2 counts).
- GET /servers/:id/endpoints: fires 4 queries per endpoint.
- GET /dashboard: fires 1 query per webapp for lastCheck.
- All are bounded by the number of webapps/domains, which is expected to remain small.

**Warning — unbounded query on Server:**
- `GET /servers/dashboard` line 94: fetches ALL servers with `findMany({ select: { lastSeenAt: true } })` to count actives, separate from the paginated query above it. Should be replaced with a `count({ where: { lastSeenAt: { gte: threshold } } })`.

**Warning — batchDeleteResolvedAlerts uses resolvedAt but resolvedAt is nullable:**
- Alerts that are `status="resolved"` but have a NULL `resolvedAt` are never cleaned up. The alert scheduler should always set resolvedAt when resolving.

**Info — ServerReport and ServerMetricMinute lack onDelete: Cascade in original init migration (now fixed by later migrations).**
- Confirmed CASCADE is present for both in the current schema.

**Migration history is clean** — 15 migrations, sequential timestamps, no gaps, latest matches current schema.

**Why:** Recorded to avoid re-auditing known issues in future sessions.
**How to apply:** Prioritize apiKeyHash index and WebApp cascade fix before next deploy.
