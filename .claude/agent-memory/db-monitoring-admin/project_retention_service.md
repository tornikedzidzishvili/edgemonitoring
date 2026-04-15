---
name: Data Retention Service
description: Centralized retention service covering all four high-volume tables; batch-delete strategy to avoid SQLite lock contention
type: project
---

`apps/api/src/dataRetention.ts` implements rolling retention for all high-volume tables.

Retention windows:
- UptimeCheckResult  — 30 days on `checkedAt`
- DomainCheckResult  — 30 days on `checkedAt`
- ServerReport       — 30 days on `reportedAt`
- ServerMetricMinute — 30 days on `minuteStart`
- ServerAlert        — 90 days on `resolvedAt`, status="resolved" only

Strategy: fetch-IDs-then-delete loop in batches of 1 000. Tables run sequentially (not in parallel) to avoid SQLITE_BUSY under WAL mode.

Public API: `startDataRetention(prisma, logger)` — fires immediately on call, then every 6 hours via `setInterval().unref()`.

**Why:** Three of four high-volume tables had zero cleanup; the database had accumulated 2 million rows. The old single-table cleanup lived inline in index.ts.

**How to apply:** When wiring into index.ts, replace the old setInterval block (lines 44-52) with a single `startDataRetention(prisma, app.log)` call. Do NOT leave the old block in place — it would double-clean ServerMetricMinute.
