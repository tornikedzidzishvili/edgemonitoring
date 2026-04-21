/**
 * GET /admin/db/health
 *
 * Admin-only endpoint that surfaces DB file size, per-table row counts,
 * oldest retained rows, and the last data-retention run summary.
 *
 * Intended for operators to proactively detect table bloat before it
 * becomes a production incident. All queries are read-only.
 *
 * Security: classified as admin in routeGuard.ts — requires valid session
 * with role === "admin". No sensitive data is exposed here.
 *
 * Timeout: the entire handler races against a 5-second deadline so a
 * wedged DB cannot block the event loop indefinitely.
 */

import { stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { lastRetentionRun } from "../dataRetention.js";

// ---------------------------------------------------------------------------
// AUTO_VACUUM pragma → human-readable label
// ---------------------------------------------------------------------------

const AUTO_VACUUM_LABELS: Record<number, string> = {
  0: "NONE",
  1: "FULL",
  2: "INCREMENTAL",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip the `file:` scheme from DATABASE_URL and return the bare path. */
function dbPathFromEnv(): string {
  const raw = process.env.DATABASE_URL ?? "";
  return raw.startsWith("file:") ? raw.slice(5) : raw;
}

/** Read a file's byte size; returns 0 if the file does not exist. */
async function safeStatBytes(path: string): Promise<number> {
  try {
    const info = await stat(path);
    return info.size;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function adminDbHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/db/health", async (_req, reply) => {
    const HANDLER_TIMEOUT_MS = 5_000;

    const work = async () => {
      const dbPath = dbPathFromEnv();
      const walPath = `${dbPath}-wal`;

      // ── File sizes ────────────────────────────────────────────────────────
      const [fileSizeBytes, walSizeBytes] = await Promise.all([
        safeStatBytes(dbPath),
        safeStatBytes(walPath),
      ]);

      // ── SQLite pragmas ────────────────────────────────────────────────────
      // $queryRawUnsafe is used because PRAGMA statements cannot be expressed
      // as parameterised queries. These are compile-time constants — no user
      // input reaches these calls.
      const [pageCountRows, freePageCountRows, pageSizeRows, autoVacuumRows] =
        await Promise.all([
          prisma.$queryRawUnsafe<Array<{ page_count: number }>>(
            "PRAGMA page_count;"
          ),
          prisma.$queryRawUnsafe<Array<{ freelist_count: number }>>(
            "PRAGMA freelist_count;"
          ),
          prisma.$queryRawUnsafe<Array<{ page_size: number }>>(
            "PRAGMA page_size;"
          ),
          prisma.$queryRawUnsafe<Array<{ auto_vacuum: number }>>(
            "PRAGMA auto_vacuum;"
          ),
        ]);

      const pageCount = Number(pageCountRows[0]?.page_count ?? 0);
      const freePageCount = Number(freePageCountRows[0]?.freelist_count ?? 0);
      const pageSizeBytes = Number(pageSizeRows[0]?.page_size ?? 0);
      const autoVacuumRaw = Number(autoVacuumRows[0]?.auto_vacuum ?? 0);
      const autoVacuumMode = AUTO_VACUUM_LABELS[autoVacuumRaw] ?? "UNKNOWN";

      // ── Table counts ──────────────────────────────────────────────────────
      const [
        serverReport,
        serverMetricMinute,
        uptimeCheckResult,
        domainCheckResult,
        serverAlert,
        activeAlerts,
      ] = await Promise.all([
        prisma.serverReport.count(),
        prisma.serverMetricMinute.count(),
        prisma.uptimeCheckResult.count(),
        prisma.domainCheckResult.count(),
        prisma.serverAlert.count(),
        // Active alerts only — status is a bounded enum-like string, safe to
        // pass as a Prisma typed filter (no raw SQL injection risk).
        prisma.serverAlert.count({ where: { status: "active" } }),
      ]);

      // ── Oldest rows ───────────────────────────────────────────────────────
      // findFirst with ascending order gives the oldest record without a
      // full-table scan thanks to the existing time-column indexes.
      const [
        oldestServerReport,
        oldestServerMetricMinute,
        oldestUptimeCheckResult,
        oldestDomainCheckResult,
      ] = await Promise.all([
        prisma.serverReport.findFirst({
          orderBy: { reportedAt: "asc" },
          select: { reportedAt: true },
        }),
        prisma.serverMetricMinute.findFirst({
          orderBy: { minuteStart: "asc" },
          select: { minuteStart: true },
        }),
        prisma.uptimeCheckResult.findFirst({
          orderBy: { checkedAt: "asc" },
          select: { checkedAt: true },
        }),
        prisma.domainCheckResult.findFirst({
          orderBy: { checkedAt: "asc" },
          select: { checkedAt: true },
        }),
      ]);

      return {
        fileSizeBytes,
        walSizeBytes,
        autoVacuumMode,
        pageCount,
        freePageCount,
        pageSizeBytes,
        tableCounts: {
          serverReport,
          serverMetricMinute,
          uptimeCheckResult,
          domainCheckResult,
          serverAlert,
          activeAlerts,
        },
        oldestRows: {
          serverReport: oldestServerReport?.reportedAt.toISOString() ?? null,
          serverMetricMinute:
            oldestServerMetricMinute?.minuteStart.toISOString() ?? null,
          uptimeCheckResult:
            oldestUptimeCheckResult?.checkedAt.toISOString() ?? null,
          domainCheckResult:
            oldestDomainCheckResult?.checkedAt.toISOString() ?? null,
        },
        // lastRetentionRun is exported by dataRetention.ts and updated in
        // place after each run. No DB query required.
        lastRetentionRun: lastRetentionRun ?? null,
        checkedAt: new Date().toISOString(),
      };
    };

    // Race the work against a hard 5-second deadline. If the DB is wedged we
    // still return promptly rather than tying up a Fastify worker.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("db-health-timeout")),
        HANDLER_TIMEOUT_MS
      )
    );

    try {
      const result = await Promise.race([work(), timeout]);
      return reply.send(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message === "db-health-timeout"
          ? "DB health check timed out"
          : "DB health check failed";

      // Do not expose internal error details in the response body.
      app.log.error({ err }, "admin/db/health handler error");
      return reply.status(503).send({ error: "service_unavailable", message });
    }
  });
}
