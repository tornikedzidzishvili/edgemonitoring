---
name: MonitoringMode and ReportSource enums — EMS-15 + EMS-38
description: MonitoringMode enum values and migration history; updated with agent_systemd (EMS-38) in migration 20260427132430
type: project
---

Two enums in schema.prisma for monitoring-path discrimination.

`MonitoringMode` enum on `Server.monitoringMode` (default: `agent`): values `agent | agent_systemd | ssh | cyberpanel`.
`ReportSource` enum on `ServerReport.source` (default: `agent`): values `agent | ssh`.

Migrations:
- `20260426192811_add_monitoring_mode_and_report_source` — initial enum columns (EMS-15)
- `20260427132430_add_agent_systemd_monitoring_mode` — added `agent_systemd` value (EMS-38)

**Why:** SQLite stores enum values as TEXT with no CHECK constraint. Adding a new enum value requires only a Prisma client regeneration — no DDL changes. The migration SQL is intentionally empty ("-- This is an empty migration.") and is registered purely for audit trail continuity.

**How to apply:** `agent_systemd` is the push-based systemd agent path for hosts that cannot run Docker (CyberPanel/Plesk/LiteSpeed). When ingesting reports from systemd agents, set `monitoringMode = agent_systemd` on the Server row. `dataRetention.ts` confirmed unaffected — filters on time columns only, no enum dependency.
