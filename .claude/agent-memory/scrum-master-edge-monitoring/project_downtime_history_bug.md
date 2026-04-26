---
name: Downtime History Bug — Alert Resolution Collapses Chart to 100%
description: P2 bug where resolving ServerAlert rows causes the downtime/availability chart to show 100% uptime for historical periods that had real outages
type: project
---

Downtime availability chart collapses to 100% uptime after user resolves alarms. Root cause: downtime computation filters on `status = "active"` (or `resolvedAt: null`), so resolved alerts drop out of the window set entirely.

Fix: query all `ServerAlert` rows in the time range (not just active ones), compute downtime windows as `[triggeredAt, resolvedAt ?? now]` per row.

**Why:** No schema change needed — `triggeredAt` and `resolvedAt` are already stored. This is a query/filter fix only. Retention is not affected (90-day retention on resolved ServerAlert rows is already in place).

**How to apply:** When triaging similar availability/uptime metric bugs, check whether the computation excludes resolved rows. The pattern of "metric looks correct until you resolve the underlying record" is a sentinel for this class of bug.

Dispatch order: backend-monitoring-architect first (locate and fix endpoint) → noc-dashboard-frontend only if client-side calculation is confirmed.

Severity: P2. Reported: 2026-04-26. Status: Triaged, not yet in sprint.