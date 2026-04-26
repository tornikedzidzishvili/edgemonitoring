---
name: CyberPanel + Agentless SSH Monitoring Epic
description: 14-story, 3-phase epic for SSH-polled server monitoring and CyberPanel shared hosting inventory — story IDs, owners, wave dispatch order, and DoD
type: project
---

Epic EMS-EPIC-001 — Agentless SSH + CyberPanel Monitoring. Planned 2026-04-26.

**Why:** Extend monitoring beyond Dockerized-agent path. SSH-polled servers need no agent install; CyberPanel servers expose website/SSL/service-health inventory via CLI over SSH.

**How to apply:** When dispatching Phase 1–3 stories, follow the wave plan strictly — schema migration (EMS-101, EMS-201) must merge and prisma generate must run before backend/frontend waves.

## Phases

- Phase 1 (Sprint 1): Generic SSH polling end-to-end — EMS-101 through EMS-106
- Phase 2 (Sprint 2): CyberPanel SharedHostingServer — EMS-201 through EMS-206
- Phase 3 (Sprint 3): Alerting + polish + docs — EMS-301 through EMS-304

## Story Owners

| ID | Title | Owner | Size | Wave |
|---|---|---|---|---|
| EMS-101 | Add monitoringMode discriminator to Server schema | db-monitoring-admin | S | 1 |
| EMS-102 | SSH poll scheduler (startSshPollScheduler) | backend-monitoring-architect | M | 2 |
| EMS-103 | Expose monitoringMode + sshKeyId in server CRUD API | backend-monitoring-architect | S | 2 |
| EMS-104 | "Test SSH connection" endpoint | backend-monitoring-architect | S | 3 |
| EMS-105 | Server Add/Edit UI — monitoring mode selector | noc-dashboard-frontend | M | 3 |
| EMS-106 | Server Detail dashboard renders SSH-sourced metrics | noc-dashboard-frontend | S | 3 |
| EMS-201 | Extend SharedHostingServer schema for CyberPanel type | db-monitoring-admin | S | 4 |
| EMS-202 | CyberPanel SSH service (services/cyberpanel.ts) | backend-monitoring-architect | M | 5 |
| EMS-203 | Extend domain scheduler for CyberPanel sync | backend-monitoring-architect | M | 6 |
| EMS-204 | SharedHostingServer CRUD API — CyberPanel fields | backend-monitoring-architect | S | 5 |
| EMS-205 | CyberPanel Detail UI panel | noc-dashboard-frontend | L | 7 |
| EMS-206 | Add SharedHosting UI — CyberPanel mode | noc-dashboard-frontend | S | 6 |
| EMS-301 | CyberPanel service-health alert rules | backend-monitoring-architect | M | 8 |
| EMS-302 | CyberPanel disk alert integration | backend-monitoring-architect | S | 9 |
| EMS-303 | Admin onboarding flow polish | noc-dashboard-frontend | S | 8 |
| EMS-304 | Operator runbook update | enterprise-devops-engineer | XS | 10 |

## Key Architectural Decisions (do not relitigate)
- monitoringMode enum on Server: agent | ssh | cyberpanel
- ServerReport gains source field: agent | ssh
- sshProbe.ts reused as-is; no new agent binary
- startSshPollScheduler() runs every 60s, configurable via SSH_POLL_INTERVAL_MS
- CyberPanel type extends SharedHostingServer (not a new model)
- p-limit(5) concurrency cap on SSH scheduler to avoid thundering herd

## Open Decision (needs tech lead input before EMS-105 dispatch)
- "Test Connection" in create flow: disable button until after first save (recommended) OR add stateless test endpoint accepting raw credentials (not recommended — wider attack surface).
