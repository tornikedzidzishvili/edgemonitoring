---
name: SQLite WAL and performance pragmas
description: WAL mode and three companion pragmas applied in db.ts at module load time
type: project
---

`apps/api/src/db.ts` applies four pragmas immediately after creating the PrismaClient:

- `PRAGMA journal_mode = WAL;`          — concurrent readers + single writer, reduces SQLITE_BUSY
- `PRAGMA synchronous = NORMAL;`        — flush on checkpoint only, safe with WAL
- `PRAGMA busy_timeout = 5000;`         — retry for 5 s before returning SQLITE_BUSY
- `PRAGMA cache_size = -20000;`         — 20 MB page cache (negative = kibibytes)
- `PRAGMA auto_vacuum = INCREMENTAL;`   — enables incremental_vacuum() calls in retention job
- `PRAGMA journal_size_limit = 67108864;` — caps WAL at 64 MB to bound disk growth
- `PRAGMA temp_store = MEMORY;`         — temp tables/indexes in RAM, avoids temp-file I/O
- `PRAGMA optimize;`                    — updates query-planner stats on startup

Applied via a chained `.$executeRawUnsafe()` promise; errors are caught and logged to stderr but are non-fatal.

**Why:** High-frequency metric writes (~2 rows/server/min) combined with a batch-delete retention job caused write-lock collisions on the default rollback-journal mode.

**How to apply:** These run automatically when `db.ts` is imported. No additional wiring needed.
