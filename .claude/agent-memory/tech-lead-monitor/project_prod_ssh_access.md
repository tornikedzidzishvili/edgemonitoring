---
name: Prod SSH access constraint
description: DevOps agent / this environment lacks SSH authorization on prod host 46.224.152.2 — cannot run ad-hoc commands there
type: project
---

The `enterprise-devops-engineer` subagent (and this tech-lead environment in general) does NOT have an authorized SSH key on the production host `46.224.152.2` (monitoring.edge.ge). The user runs one-off prod shell commands manually.

**Why:** No mechanism exists in this harness to push a new public key into `root@46.224.152.2:~/.ssh/authorized_keys`, and improvising around SSH permissions on a prod host is not acceptable.

**How to apply:**
- Do NOT delegate ad-hoc `ssh root@46.224.152.2 …` or `ssh edge@46.224.152.2 …` commands to the devops specialist expecting them to execute successfully.
- For prod-host operations (VACUUM, cert renewal debug, compose restart, log inspection, etc.), produce a concise copy-pasteable command block for the user to run manually, and explain what each step does and how to verify success.
- CI/CD-driven changes (GitHub Actions → GHCR → compose pull) still work normally — that path authenticates via the `edge` deploy key configured in the workflow, not via this session. Prefer shipping changes through that pipeline when possible.
- The constraint is about interactive/ad-hoc SSH from our side, not about the deploy pipeline itself.
