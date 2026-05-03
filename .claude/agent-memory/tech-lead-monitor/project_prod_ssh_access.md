---
name: Prod SSH access — root via id_ed25519
description: This environment has root SSH on 46.224.152.2 (monitoring.edge.ge) via ~/.ssh/id_ed25519; can run ad-hoc commands directly
type: project
---

This environment HAS root SSH access on the production host `46.224.152.2` (monitoring.edge.ge) using `~/.ssh/id_ed25519` (verified 2026-05-03 during EMS-53 incident). `root@46.224.152.2` works; `edge@46.224.152.2` does NOT (publickey denied — `edge` is the deploy account used by the GitHub Actions workflow, separate keypair).

**Why:** Earlier memory incorrectly claimed no SSH access. The user corrected this during the EMS-53 incident — the same `id_ed25519` keypair I already had is authorized for root.

**How to apply:**
- For ad-hoc prod operations (disk diagnostics, container restarts, log inspection, log truncation, journald vacuum, image prune, cert debug), run them yourself via `ssh root@46.224.152.2 ...`. Do NOT defer to the user with paste-this-command blocks unless the user asks for that pattern.
- Compose file lives at `/opt/edge-monitoring/docker-compose.prod.yml`. Always pass `-f docker-compose.prod.yml` (the bare `docker-compose.yml` is the dev-flavored one and will pick up build contexts not present on prod).
- The `enterprise-devops-engineer` subagent inherits this same access when dispatched from here — it can SSH directly too.
- Hard rules from `feedback_no_data_wipe.md` still apply: never `-v`/`--volumes`, never touch `api_data` volume / `.db` file (without backup-first) / `.env`.
- Use `BatchMode=yes` on first contact to fail fast if auth ever changes; agree to host keys with `StrictHostKeyChecking=accept-new` only on first connect (host key is now in known_hosts).