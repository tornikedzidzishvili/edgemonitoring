/**
 * Data Retention Service
 *
 * Enforces rolling retention windows on all high-volume monitoring tables.
 * Uses batched deletes (1 000 rows per iteration) to avoid holding a write
 * lock on the SQLite file for too long while the system is under load.
 *
 * Retention windows:
 *   UptimeCheckResult   30 days  (checkedAt)
 *   DomainCheckResult   30 days  (checkedAt)
 *   ServerReport         7 days  (reportedAt)  ← shortened by user decision
 *   ServerMetricMinute  30 days  (minuteStart)
 *   ServerAlert         90 days  (resolvedAt, resolved records only)
 *
 * Schedule: runs once on startup, then every 6 hours.
 */

import { PrismaClient } from "@prisma/client";

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 1_000;
const RETENTION_7_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
const RETENTION_30_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const RETENTION_90_DAYS_MS = 90 * 24 * 60 * 60 * 1_000;
const INTERVAL_MS = 6 * 60 * 60 * 1_000; // 6 hours

// ─── Logger interface (Fastify-compatible subset) ────────────────────────────

interface RetentionLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

// ─── Observability types ─────────────────────────────────────────────────────

export interface RetentionRunSummary {
  /** ISO timestamp when the run completed. */
  completedAt: string;
  /** Wall-clock duration of the entire run in milliseconds. */
  durationMs: number;
  /** Rows deleted per table. -1 indicates the table's cleanup failed. */
  deleted: {
    uptimeCheckResult: number;
    domainCheckResult: number;
    serverReport: number;
    serverMetricMinute: number;
    serverAlert: number;
  };
  /** Result of the WAL checkpoint performed at the end of the run. */
  checkpoint: {
    ok: boolean;
    busy: number | null;
    log: number | null;
    checkpointed: number | null;
  };
}

/**
 * Last completed retention run summary.
 * Updated at the end of every successful (or partially-failed) run.
 * null until the first run completes.
 * Exported so the backend /admin/db/health route can surface it.
 */
export let lastRetentionRun: RetentionRunSummary | null = null;

// ─── Batch-delete helpers ────────────────────────────────────────────────────

/**
 * Deletes rows in batches of BATCH_SIZE.
 * Fetches a page of IDs that are older than `cutoff`, deletes them, then
 * repeats until no qualifying rows remain.  This keeps individual DELETE
 * statements small so SQLite's write lock is released between iterations.
 *
 * Returns the total number of rows deleted.
 */
async function batchDeleteUptimeCheckResults(
  prisma: PrismaClient,
  cutoff: Date
): Promise<number> {
  let total = 0;

  while (true) {
    // Fetch a batch of IDs that are beyond the retention window.
    const rows = await prisma.uptimeCheckResult.findMany({
      where: { checkedAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const { count } = await prisma.uptimeCheckResult.deleteMany({
      where: { id: { in: ids } },
    });

    total += count;
  }

  return total;
}

async function batchDeleteDomainCheckResults(
  prisma: PrismaClient,
  cutoff: Date
): Promise<number> {
  let total = 0;

  while (true) {
    const rows = await prisma.domainCheckResult.findMany({
      where: { checkedAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const { count } = await prisma.domainCheckResult.deleteMany({
      where: { id: { in: ids } },
    });

    total += count;
  }

  return total;
}

async function batchDeleteServerReports(
  prisma: PrismaClient,
  cutoff: Date
): Promise<number> {
  let total = 0;

  while (true) {
    const rows = await prisma.serverReport.findMany({
      where: { reportedAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const { count } = await prisma.serverReport.deleteMany({
      where: { id: { in: ids } },
    });

    total += count;
  }

  return total;
}

async function batchDeleteServerMetricMinutes(
  prisma: PrismaClient,
  cutoff: Date
): Promise<number> {
  let total = 0;

  while (true) {
    const rows = await prisma.serverMetricMinute.findMany({
      where: { minuteStart: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const { count } = await prisma.serverMetricMinute.deleteMany({
      where: { id: { in: ids } },
    });

    total += count;
  }

  return total;
}

/**
 * Removes resolved ServerAlert records older than 90 days.
 * Active alerts are never touched regardless of age.
 */
async function batchDeleteResolvedAlerts(
  prisma: PrismaClient,
  cutoff: Date
): Promise<number> {
  let total = 0;

  while (true) {
    const rows = await prisma.serverAlert.findMany({
      where: {
        status: "resolved",
        resolvedAt: { lt: cutoff },
      },
      select: { id: true },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const { count } = await prisma.serverAlert.deleteMany({
      where: { id: { in: ids } },
    });

    total += count;
  }

  return total;
}

// ─── Main retention run ───────────────────────────────────────────────────────

async function runRetention(
  prisma: PrismaClient,
  logger: RetentionLogger
): Promise<void> {
  const now = Date.now();
  const cutoff7 = new Date(now - RETENTION_7_DAYS_MS);
  const cutoff30 = new Date(now - RETENTION_30_DAYS_MS);
  const cutoff90 = new Date(now - RETENTION_90_DAYS_MS);

  logger.info("data-retention: starting cleanup run", {
    cutoff7days: cutoff7.toISOString(),
    cutoff30days: cutoff30.toISOString(),
    cutoff90days: cutoff90.toISOString(),
  });

  // Run tables sequentially — SQLite only supports one writer at a time.
  // Running in parallel would cause SQLITE_BUSY contention.

  // Track per-table deleted counts; -1 signals a failure for that table.
  let uptimeDeleted = -1;
  let domainDeleted = -1;
  let reportDeleted = -1;
  let metricDeleted = -1;
  let alertDeleted = -1;

  try {
    uptimeDeleted = await batchDeleteUptimeCheckResults(prisma, cutoff30);
    logger.info("data-retention: UptimeCheckResult (30d)", {
      deleted: uptimeDeleted,
    });
  } catch (err) {
    logger.error("data-retention: failed to clean UptimeCheckResult", {
      error: String(err),
    });
  }

  try {
    domainDeleted = await batchDeleteDomainCheckResults(prisma, cutoff30);
    logger.info("data-retention: DomainCheckResult (30d)", {
      deleted: domainDeleted,
    });
  } catch (err) {
    logger.error("data-retention: failed to clean DomainCheckResult", {
      error: String(err),
    });
  }

  try {
    // ServerReport uses a 7-day window (shortened per user decision).
    reportDeleted = await batchDeleteServerReports(prisma, cutoff7);
    logger.info("data-retention: ServerReport (7d)", {
      deleted: reportDeleted,
    });
  } catch (err) {
    logger.error("data-retention: failed to clean ServerReport", {
      error: String(err),
    });
  }

  try {
    metricDeleted = await batchDeleteServerMetricMinutes(prisma, cutoff30);
    logger.info("data-retention: ServerMetricMinute (30d)", {
      deleted: metricDeleted,
    });
  } catch (err) {
    logger.error("data-retention: failed to clean ServerMetricMinute", {
      error: String(err),
    });
  }

  try {
    alertDeleted = await batchDeleteResolvedAlerts(prisma, cutoff90);
    logger.info("data-retention: ServerAlert (resolved, 90d)", {
      deleted: alertDeleted,
    });
  } catch (err) {
    logger.error("data-retention: failed to clean ServerAlert", {
      error: String(err),
    });
  }

  // ── Incremental vacuum (reclaim free pages in small batches) ─────────────
  // EMS-55: without this, SQLite marks deleted rows as free pages internally
  // but never returns that space to the OS, causing the .db file to grow
  // unboundedly even after faithful retention deletes (root cause of P1 disk
  // fill on 2026-05-03).  Runs 500 pages per invocation to stay under the
  // write-lock budget.  Only effective when auto_vacuum = INCREMENTAL is set
  // (see db.ts).
  try {
    await prisma.$executeRawUnsafe("PRAGMA incremental_vacuum(500);");
    await prisma.$executeRawUnsafe("PRAGMA optimize;");
    logger.info("data-retention: incremental_vacuum + optimize complete");
  } catch (err) {
    logger.error("data-retention: incremental_vacuum/optimize failed", {
      error: String(err),
    });
  }

  // ── WAL checkpoint ────────────────────────────────────────────────────────
  // TRUNCATE mode resets the WAL file to zero length after checkpointing,
  // reclaiming disk space immediately.  We log the three counters SQLite
  // returns so ops can verify the checkpoint was not blocked.
  let checkpointOk = false;
  let checkpointBusy: number | null = null;
  let checkpointLog: number | null = null;
  let checkpointCheckpointed: number | null = null;

  try {
    // Returns a single row: { busy, log, checkpointed }
    const rows = await prisma.$queryRawUnsafe<
      { busy: number; log: number; checkpointed: number }[]
    >("PRAGMA wal_checkpoint(TRUNCATE);");

    if (rows.length > 0) {
      checkpointBusy = rows[0].busy;
      checkpointLog = rows[0].log;
      checkpointCheckpointed = rows[0].checkpointed;
    }
    checkpointOk = true;

    logger.info("data-retention: WAL checkpoint complete", {
      busy: checkpointBusy,
      log: checkpointLog,
      checkpointed: checkpointCheckpointed,
    });
  } catch (err) {
    logger.error("data-retention: WAL checkpoint failed", {
      error: String(err),
    });
  }

  const durationMs = Date.now() - now;

  logger.info("data-retention: cleanup run complete", { durationMs });

  // ── Update module-level summary (read by /admin/db/health) ───────────────
  lastRetentionRun = {
    completedAt: new Date().toISOString(),
    durationMs,
    deleted: {
      uptimeCheckResult: uptimeDeleted,
      domainCheckResult: domainDeleted,
      serverReport: reportDeleted,
      serverMetricMinute: metricDeleted,
      serverAlert: alertDeleted,
    },
    checkpoint: {
      ok: checkpointOk,
      busy: checkpointBusy,
      log: checkpointLog,
      checkpointed: checkpointCheckpointed,
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts the data-retention service.
 *
 * Runs an immediate cleanup pass so stale data is purged on every restart,
 * then schedules a recurring pass every 6 hours.  The timer is unref()'d so
 * it does not prevent the Node.js process from exiting cleanly.
 */
export function startDataRetention(
  prisma: PrismaClient,
  logger: RetentionLogger
): void {
  // Immediate first pass — do not await so the caller is not blocked.
  runRetention(prisma, logger).catch((err) => {
    logger.error("data-retention: unhandled error in initial run", {
      error: String(err),
    });
  });

  // Recurring pass every 6 hours.
  const timer = setInterval(() => {
    runRetention(prisma, logger).catch((err) => {
      logger.error("data-retention: unhandled error in scheduled run", {
        error: String(err),
      });
    });
  }, INTERVAL_MS);

  // Allow the process to exit normally even if the timer is still pending.
  timer.unref();
}
