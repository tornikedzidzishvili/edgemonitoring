---
name: Disk-full outages must be prevented, not just fixed
description: User has explicitly asked twice for prod disk to never fill up; existing 30d retention covers DB rows only and is not sufficient
type: feedback
---

Disk-full on prod must not recur. The user explicitly asked previously for "30 days data kept, older logs removed" and treats a repeat as a broken contract — not a fresh incident.

**Why:** Production went down with disk-full at least twice (2026-05-03 EMS-53 and an earlier incident). The user's mental model: "I asked you to handle retention, so this shouldn't happen." A second occurrence of the same root cause is a quality failure, not bad luck.

**How to apply:**
- The existing `dataRetention.ts` 30-day sweep covers DB rows (UptimeCheckResult, DomainCheckResult, ServerReport, ServerMetricMinute, resolved ServerAlert at 90d). It does NOT cover:
  - Docker container logs (no log rotation in compose by default — json-file driver grows unbounded)
  - nginx access/error logs inside web/proxy containers
  - journald system logs on the host
  - Old Docker images / build cache from prior deploys
  - SQLite file size — prod DB has `auto_vacuum=NONE` (see `project_sqlite_auto_vacuum.md`), so deleted rows don't reclaim disk until VACUUM runs
- When working on retention or any "keep disk clean" task, treat it as cross-layer: db-monitoring-admin (VACUUM cadence, file size guardrail) AND enterprise-devops-engineer (Docker log rotation in compose, journald SystemMaxUse, image prune cron, disk-usage alert that pages before 90% full).
- Whenever a fix is made for disk-full, also add a *preventive* lever: a monitoring alert at 80%/90% disk so the user gets paged before the site goes blank, never after.
- Phrase any post-incident comms with the user as: "previous fix was insufficient because it only covered X; here is what we're adding to cover Y, Z." Do not minimize that this happened twice.
