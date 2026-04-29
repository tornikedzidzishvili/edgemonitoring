---
name: Smart Agent Install Initiative
description: 4-story initiative for auto-stack detection at agent install time; eliminates operator pre-selection of monitoringMode
type: project
---

EMS-DETECT-01 through EMS-DETECT-04 cover the smart install feature (planned 2026-04-27, P1).

**Why:** Operators were forced to know the target host's stack (CyberPanel vs Docker vs systemd) before clicking Install Agent. The immediate trigger was a production install failure on 23.88.126.76 — a CyberPanel host where deploy-ubuntu.sh failed due to BuildKit not being enabled on the legacy Docker builder.

**Decision recorded:** Legacy-builder Docker fallback → agent_systemd (do NOT write /etc/docker/daemon.json). Rationale: writing daemon config is a destructive side-effect on hosts running other Docker workloads; systemd mode achieves equivalent monitoring outcome.

**Schema:** No migration needed. agent_systemd already exists in the Server.monitoringMode enum.

**Dispatch order:**
- Wave 1 (parallel): EMS-DETECT-01 (detector service), EMS-DETECT-03 (persist mode on install)
- Wave 2: EMS-DETECT-02 (detect-stack endpoint) — needs EMS-DETECT-01
- Wave 3: EMS-DETECT-04 (modal UI) — needs EMS-DETECT-02 + EMS-DETECT-03

**Out of scope this sprint:** BuildKit fix in edgemonitoringagent repo (tracked separately), non-Debian distro gating, SharedHostingServer flow.

**How to apply:** When the tech lead dispatches these stories, confirm Wave 1 is fully merged before dispatching Wave 2. EMS-DETECT-04 must not be dispatched until both API stories are in production (the modal hits real endpoints, not mocks).