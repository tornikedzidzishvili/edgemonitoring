---
name: HARD RULE — never wipe servers, credentials, or settings
description: Disk cleanup and any prod operation must preserve all user-owned data; only volatile artifacts may be removed
type: feedback
---

When cleaning up disk, fixing prod, or doing any destructive-sounding operation, the user's data must survive intact. He has explicitly said "I should be able to keep creds servers and settings by all means."

**Why:** The user manages production infrastructure for clients via this platform. Server records, encrypted SSH keys, encrypted SMTP/SMS credentials, encrypted shared-hosting credentials, alert rules, branding, user accounts/passkeys/TOTP — all of these are operational state that took real work to enter and cannot be reconstructed from scratch. Losing them is a far worse outcome than the outage itself.

**How to apply:**
- The `api_data` Docker volume (mounts to `/data/edge-monitoring.db` inside the api container) is sacred. NEVER:
  - `docker volume rm api_data` or anything that targets the volume
  - `docker compose down -v` (the `-v` removes named volumes)
  - `docker system prune --volumes` (nukes named volumes too)
  - delete or rewrite the `.db` file in place without an offline backup copy first
- Before any DB-level operation (VACUUM, PRAGMA changes, schema migration on prod), take a side-copy of the `.db` file (`cp` while api is briefly stopped, or `.backup` SQLite command online) to a path that survives the operation. Verify byte count of the backup.
- The `/opt/edge-monitoring/.env` file holds secrets (`SSH_KEY_MASTER_SECRET` is the master key for AES-GCM at-rest encryption — losing it makes every encrypted credential in the DB unrecoverable). Do not overwrite, do not regenerate.
- Safe-to-remove artifacts on prod (these are volatile, not state):
  - Docker container json-file logs (`/var/lib/docker/containers/*/*-json.log`)
  - journald logs (`journalctl --vacuum-size=...`)
  - Old/unused Docker images (`docker image prune -af` is safe — only removes images not referenced by running containers)
  - Docker builder cache (`docker builder prune -af`)
  - Time-series metric data older than 30 days (already governed by `dataRetention.ts`)
- When dispatching specialists for prod work, include the explicit constraint in the brief: "must not touch the api_data volume, the .db file (without backup-first), or .env."
- If a fix would require any of the forbidden operations, escalate to the user with the specific risk and ask for explicit approval — do not proceed.
