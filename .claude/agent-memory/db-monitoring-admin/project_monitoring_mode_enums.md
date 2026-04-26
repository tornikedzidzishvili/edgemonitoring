---
name: MonitoringMode and ReportSource enums — EMS-15
description: Wave 1 schema discriminator for agentless SSH + CyberPanel monitoring paths added in migration 20260426192811
type: project
---

Two enums added to schema.prisma for the "Agentless SSH + CyberPanel" epic (EMS-14).

`MonitoringMode` enum on `Server.monitoringMode` (default: `agent`): values `agent | ssh | cyberpanel`.
`ReportSource` enum on `ServerReport.source` (default: `agent`): values `agent | ssh`.

Migration: `20260426192811_add_monitoring_mode_and_report_source`

**Why:** Every Wave 2 story (scheduler, CRUD API, UI mode selector, dashboards, alerting) compiles against these enum types. Nothing in Wave 2 can ship until this migration is deployed.

**How to apply:** When adding SSH polling or CyberPanel ingestion code, set `monitoringMode` on Server rows and `source` on ServerReport rows accordingly. SQLite stores enums as TEXT with a DB-level default so existing rows already have `agent` without a backfill script. `dataRetention.ts` confirmed unaffected — it filters by `reportedAt`/`checkedAt` only and has no dependency on either new column.
