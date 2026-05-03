---
name: SQLite auto_vacuum mode — EMS-55 P1 post-incident hardening
description: Prod DB was auto_vacuum=NONE; flipped to INCREMENTAL via one-time VACUUM on 2026-05-03 to reclaim disk space after retention deletes
type: project
---

Prod DB was confirmed `auto_vacuum=NONE` (returns `0`) before EMS-55. SQLite with NONE mode marks deleted rows as free pages internally but never shrinks the file, so weeks of retention deletes did not reclaim any disk space.

**One-time VACUUM executed on 2026-05-03:**
- API container stopped with `docker compose stop api` (never `down`)
- Sidecar alpine container ran `PRAGMA auto_vacuum = INCREMENTAL; VACUUM;`
- Post-VACUUM `PRAGMA auto_vacuum` confirmed `2` (INCREMENTAL)
- Pre-VACUUM size: 1,358,163,968 bytes; post-VACUUM: 1,344,446,464 bytes (~13.7 MB reclaimed immediately)
- API restarted, healthcheck passed, `/api/health` returned 200

**Backup taken before VACUUM:**
- Path: `/opt/edge-monitoring/backups/edge-monitoring-pre-vacuum-20260503T183344Z.db`
- Size: 1,358,163,968 bytes (SHA256: `442680f524458cdfb262b5cd7d2b577734e5ccd3a8e603ad2a1b1c985774c673`)
- WAL and SHM files also backed up with same timestamp prefix

**Ongoing mechanism (already in codebase):**
- `PRAGMA auto_vacuum = INCREMENTAL` in `db.ts` startup chain — no-op for existing DBs, bootstraps new ones
- `PRAGMA incremental_vacuum(500)` in `dataRetention.ts` after every retention sweep — returns free pages to OS continuously every 6 hours
- Both lines carry EMS-55 reference comments explaining the root cause

**Why:** Root cause of P1 disk fill on 2026-05-03: 20 GB orphan `.db` file was the immediate trigger, but `auto_vacuum=NONE` meant the live DB would have eventually caused the same problem on its own.

**How to apply:** The VACUUM has been done — no repeat needed unless the DB is replaced from scratch. If ever migrating to a new DB file, remember the new file will inherit INCREMENTAL mode from db.ts startup pragmas.
