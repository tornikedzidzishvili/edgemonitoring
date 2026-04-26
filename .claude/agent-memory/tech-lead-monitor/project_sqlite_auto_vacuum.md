---
name: SQLite auto_vacuum state on prod DB
description: Prod SQLite DB was created with auto_vacuum=NONE; plan is to flip it to INCREMENTAL so retention deletes return pages to the OS
type: project
---

Production `/data/edge-monitoring.db` was originally created with `auto_vacuum=NONE` (SQLite's default). Retention deletes in `src/dataRetention.ts` therefore mark pages as free-inside-file but never shrink the file on disk — historical bloat incidents came from this.

**Why:** `auto_vacuum` can only be changed by executing `PRAGMA auto_vacuum = INCREMENTAL` followed by a full `VACUUM` (the mode is stored in the DB file header and a VACUUM is what rewrites it). The pragma alone is a no-op on an already-initialized DB.

**How to apply:**
- The one-time migration command block (run manually on the prod host, not via this harness):
  ```
  ssh root@46.224.152.2
  docker exec edge-monitoring-api sh -c 'apk add --no-cache sqlite'
  docker exec edge-monitoring-api sqlite3 /data/edge-monitoring.db "PRAGMA auto_vacuum = INCREMENTAL; VACUUM;"
  docker exec edge-monitoring-api sqlite3 /data/edge-monitoring.db "PRAGMA auto_vacuum;"   # must return 2
  ```
- Once `PRAGMA auto_vacuum` reads `2`, no further code change is required — the existing `dataRetention.ts` delete cycle will naturally return pages to the OS.
- Consider (future hardening): issue `PRAGMA auto_vacuum = INCREMENTAL` at DB-creation time in `src/db.ts` so fresh environments start in INCREMENTAL mode without manual intervention. The pragma must be set *before* any tables exist to take effect without a VACUUM — otherwise the VACUUM dance above is still required.
- If bloat ever recurs despite this, the next step is `PRAGMA incremental_vacuum(N)` called periodically from the retention job, which reclaims N free pages per invocation without a full VACUUM.
