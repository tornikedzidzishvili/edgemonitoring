import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! });

export const prisma = new PrismaClient({ adapter });

/**
 * SQLite performance pragmas applied once at module load time.
 *
 * WAL mode:          Allows concurrent readers alongside a single writer,
 *                    dramatically reducing "database is locked" errors under
 *                    the monitoring workload.
 *
 * synchronous=NORMAL: Flushes on checkpoints rather than every transaction.
 *                    Safe for WAL mode; provides a good durability/speed
 *                    balance (full-power-loss risk is minimal for monitoring
 *                    telemetry data).
 *
 * busy_timeout=5000: Before returning SQLITE_BUSY, SQLite will retry for up
 *                    to 5 seconds.  Prevents spurious write failures when the
 *                    retention cleanup job and a metric write overlap.
 *
 * cache_size=-20000: Negative value = kibibytes.  Allocates a 20 MB page
 *                    cache so hot index pages stay in memory and avoid disk
 *                    I/O on repeated time-range queries.
 */
void prisma
  .$executeRawUnsafe("PRAGMA journal_mode = WAL;")
  .then(() => prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL;"))
  .then(() => prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000;"))
  .then(() => prisma.$executeRawUnsafe("PRAGMA cache_size = -20000;"))
  .then(() => prisma.$executeRawUnsafe("PRAGMA auto_vacuum = INCREMENTAL;")) // EMS-55: enables incremental_vacuum() in retention job to return freed pages to the OS; only takes effect on a new DB or after a one-time VACUUM on existing DBs
  .then(() => prisma.$executeRawUnsafe("PRAGMA journal_size_limit = 67108864;"))
  .then(() => prisma.$executeRawUnsafe("PRAGMA temp_store = MEMORY;"))
  .then(() => prisma.$executeRawUnsafe("PRAGMA optimize;"))
  .catch((err: unknown) => {
    // Non-fatal — the server can still operate without these optimisations,
    // but log loudly so the issue is visible.
    console.error("[db] Failed to apply SQLite pragmas:", err);
  });
