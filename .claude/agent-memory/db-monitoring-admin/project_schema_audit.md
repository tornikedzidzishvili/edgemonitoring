---
name: Schema audit findings — April 2026
description: Comprehensive schema, retention, index, and write-path audit — updated with storage-hardening findings 2026-04-21
type: project
---

## Previous findings (2026-04-15)

- `Server.apiKeyHash` was missing an index — fixed in migration 20260415165243.
- `UptimeCheckResult.ok` index added in same migration.
- `WebApp → UptimeCheckResult` cascade confirmed via migration.
- N+1 patterns: GET /webapps, GET /shared-hosting/:id, GET /servers/:id/endpoints — bounded by small entity counts, acceptable.
- Unbounded `GET /servers/dashboard` count query — known issue.
- `batchDeleteResolvedAlerts` skips resolved alerts with NULL `resolvedAt`.

## Storage-hardening audit findings (2026-04-21)

**ServerMetricMinute redundant index**: both `@@unique([serverId, minuteStart])` AND `@@index([serverId, minuteStart])` exist — the unique constraint already creates a B-tree index; the explicit `@@index` is a duplicate waste of write overhead and storage.

**No auto_vacuum**: SQLite never releases freed pages to OS. Even when retention succeeds, file size never shrinks. Need `PRAGMA auto_vacuum = INCREMENTAL` + one-time `VACUUM` on prod DB, then `PRAGMA incremental_vacuum(N)` after each retention run.

**ServerReport is the 2M-row culprit**: ingested every ~30s per server (agents report at ~30s cadence, rate limit allows up to 120/min per IP). Stores full JSON payload (~several KB per row).

**ServerReport payload consumers — exhaustive list:**
- `GET /servers` (list): reads only `serverId, reportedAt` scoped to last 12h — no payload needed
- `GET /servers/:id`: `findFirst` latest only — displays current snapshot
- `GET /servers/:id/stream` (SSE): polls every 2s for latest only — real-time dashboard
- `GET /webapps/:id`: `findFirst` latest only — host metrics panel
- `DELETE /servers/:id`: cascades all reports (correct behavior)
- **No consumer reads ServerReport rows older than 12 hours.** The 12h presence-bucket query is the widest look-back.

**Retention index mismatch**: batch-delete helpers filter by time column alone (`checkedAt < cutoff`, `reportedAt < cutoff`), but all indexes are composite `(parentId, timeCol)`. SQLite will scan the composite index with only the time predicate, which is suboptimal. Single-column time indexes on each retention column would make cleanup faster.

**No incremental_vacuum after retention**: pages freed by retention pass are never released to OS, so file grows forever.

**No PRAGMA optimize**: query planner statistics drift over time.

**No WAL checkpoint management**: WAL can grow unbounded without `PRAGMA wal_checkpoint(TRUNCATE)` and `PRAGMA journal_size_limit`.

**Rate limiter for /agents/report**: 120 req/min per IP. Normal cadence is ~2/min. Flood risk is bounded per IP, but N servers behind NAT share the same bucket — could starve legitimate agents. Key concern: rate limiter is IP-keyed, not agent-key-keyed.

**ServerAlert active-alert growth risk**: `resolvedAt` is only set on manual resolution. No auto-resolution or timeout mechanism. Active alerts accumulate indefinitely and are never touched by retention.

**WebApp.serverId FK has no onDelete behavior defined**: deleting a Server leaves WebApp rows with a stale serverId reference (not a cascade gap — serverId is nullable, so the FK is effectively optional, but orphaned rows linger).

**Why:** Storage-hardening request after prod DB hit >2M rows and became inoperable.
**How to apply:** Use this list as the canonical issue tracker when drafting migrations and code changes in future sessions.
