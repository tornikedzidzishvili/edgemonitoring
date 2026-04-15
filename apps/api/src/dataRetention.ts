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
 *   ServerReport        30 days  (reportedAt)
 *   ServerMetricMinute  30 days  (minuteStart)
 *   ServerAlert         90 days  (resolvedAt, resolved records only)
 *
 * Schedule: runs once on startup, then every 6 hours.
 */

import { PrismaClient } from "@prisma/client";

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 1_000;
const RETENTION_30_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const RETENTION_90_DAYS_MS = 90 * 24 * 60 * 60 * 1_000;
const INTERVAL_MS = 6 * 60 * 60 * 1_000; // 6 hours

// ─── Logger interface (Fastify-compatible subset) ────────────────────────────

interface RetentionLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

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
  const cutoff30 = new Date(now - RETENTION_30_DAYS_MS);
  const cutoff90 = new Date(now - RETENTION_90_DAYS_MS);

  logger.info("data-retention: starting cleanup run", {
    cutoff30: cutoff30.toISOString(),
    cutoff90: cutoff90.toISOString(),
  });

  // Run tables sequentially — SQLite only supports one writer at a time.
  // Running in parallel would cause SQLITE_BUSY contention.
  try {
    const uptimeDeleted = await batchDeleteUptimeCheckResults(prisma, cutoff30);
    logger.info("data-retention: UptimeCheckResult", {
      deleted: uptimeDeleted,
    });
  } catch (err) {
    logger.error("data-retention: failed to clean UptimeCheckResult", {
      error: String(err),
    });
  }

  try {
    const domainDeleted = await batchDeleteDomainCheckResults(prisma, cutoff30);
    logger.info("data-retention: DomainCheckResult", {
      deleted: domainDeleted,
    });
  } catch (err) {
    logger.error("data-retention: failed to clean DomainCheckResult", {
      error: String(err),
    });
  }

  try {
    const reportDeleted = await batchDeleteServerReports(prisma, cutoff30);
    logger.info("data-retention: ServerReport", { deleted: reportDeleted });
  } catch (err) {
    logger.error("data-retention: failed to clean ServerReport", {
      error: String(err),
    });
  }

  try {
    const metricDeleted = await batchDeleteServerMetricMinutes(
      prisma,
      cutoff30
    );
    logger.info("data-retention: ServerMetricMinute", {
      deleted: metricDeleted,
    });
  } catch (err) {
    logger.error("data-retention: failed to clean ServerMetricMinute", {
      error: String(err),
    });
  }

  try {
    const alertDeleted = await batchDeleteResolvedAlerts(prisma, cutoff90);
    logger.info("data-retention: ServerAlert (resolved, 90d)", {
      deleted: alertDeleted,
    });
  } catch (err) {
    logger.error("data-retention: failed to clean ServerAlert", {
      error: String(err),
    });
  }

  logger.info("data-retention: cleanup run complete", {
    durationMs: Date.now() - now,
  });
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
