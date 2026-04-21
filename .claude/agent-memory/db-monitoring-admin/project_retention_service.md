---
name: Data Retention Service
description: Centralized retention service covering all four high-volume tables; batch-delete strategy to avoid SQLite lock contention
type: project
---

`apps/api/src/dataRetention.ts` implements rolling retention for all high-volume tables.

Retention windows (as of 2026-04-21):
- UptimeCheckResult  — 30 days on `checkedAt`
- DomainCheckResult  — 30 days on `checkedAt`
- ServerReport       —  7 days on `reportedAt`  ← shortened from 30d, user-approved
- ServerMetricMinute — 30 days on `minuteStart`
- ServerAlert        — 90 days on `resolvedAt`, status="resolved" only

Strategy: fetch-IDs-then-delete loop in batches of 1 000. Tables run sequentially (not in parallel) to avoid SQLITE_BUSY under WAL mode.

Post-cleanup operations (appended after all table try/catches in `runRetention`):
1. `PRAGMA incremental_vacuum(500)` + `PRAGMA optimize` — reclaims free pages in small batches.
2. `PRAGMA wal_checkpoint(TRUNCATE)` — resets WAL to zero length; logs busy/log/checkpointed counters.

Observability: exports `lastRetentionRun: RetentionRunSummary | null` and the `RetentionRunSummary` type. Backend reads this from `/admin/db/health` (route owned by backend agent).

Public API: `startDataRetention(prisma, logger)` — fires immediately on call, then every 6 hours via `setInterval().unref()`.

**Why:** Three of four high-volume tables had zero cleanup; the database had accumulated 2 million rows. The old single-table cleanup lived inline in index.ts.

**How to apply:** When wiring into index.ts, replace the old setInterval block (lines 44-52) with a single `startDataRetention(prisma, app.log)` call. Do NOT leave the old block in place — it would double-clean ServerMetricMinute.
