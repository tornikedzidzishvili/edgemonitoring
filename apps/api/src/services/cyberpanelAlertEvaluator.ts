/**
 * CyberPanel Service Alert Evaluator — EMS-27
 *
 * Evaluates the serviceStatus blob written by syncCyberPanel (EMS-23) and
 * maintains SharedHostingAlert rows with a 2-cycle debounce state machine:
 *
 *   Cycle N  — service inactive → create row: status="pending"  (no notification)
 *   Cycle N+1 — service still inactive → transition to status="active", notify
 *   Any cycle — service active again:
 *     - if "pending" row exists → delete it (single-cycle blip, no alert)
 *     - if "active" row exists → mark "resolved", notify
 *
 * The evaluator is called once per server, right after syncCyberPanel()
 * succeeds (in the scheduler's Promise.all loop — not on a separate timer).
 *
 * Security notes:
 * - serverId is logged; no credential or key material is ever referenced here.
 * - serviceStatus JSON from SharedHostingDomain is treated as untrusted input:
 *   we validate the parsed shape before acting on it.
 * - All DB writes are via Prisma parameterized queries.
 */

import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { sendSharedHostingAlertNotification } from "../alerts.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The three CyberPanel service names we track. Using a readonly tuple so the
 * compiler enforces exhaustiveness and prevents accidental typos.
 */
const CYBERPANEL_SERVICES = ["lscpd", "lsws", "mariadb"] as const;
type CyberPanelService = (typeof CYBERPANEL_SERVICES)[number];

/**
 * The parsed + validated shape of SharedHostingDomain.serviceStatus.
 * All three keys must be present with a recognised string value.
 */
type ServiceStatusMap = Record<CyberPanelService, "active" | "inactive">;

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/**
 * Parses and validates a serviceStatus JSON string from a SharedHostingDomain
 * row. Returns null if the value is absent, unparseable, or structurally
 * invalid — the evaluator skips the server in that case.
 *
 * We do not trust the content: a compromised or misconfigured CyberPanel host
 * could write arbitrary data into this field via the sync path.
 */
function parseServiceStatus(raw: string | null): ServiceStatusMap | null {
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  const result: Partial<ServiceStatusMap> = {};

  for (const svc of CYBERPANEL_SERVICES) {
    const val = obj[svc];
    if (val !== "active" && val !== "inactive") return null;
    result[svc] = val;
  }

  return result as ServiceStatusMap;
}

// ---------------------------------------------------------------------------
// Per-service state machine
// ---------------------------------------------------------------------------

/**
 * Runs the pending → active → resolved state machine for a single service
 * on a single server.
 *
 * @param prisma     Prisma client
 * @param env        Env (needed by notification dispatch)
 * @param serverId   SharedHostingServer.id
 * @param serverName Human-readable server name (for notification messages)
 * @param service    The service being evaluated ("lscpd" | "lsws" | "mariadb")
 * @param isInactive True if the latest sync reported this service as "inactive"
 */
async function evaluateService(
  prisma: PrismaClient,
  env: Env,
  serverId: string,
  serverName: string,
  service: CyberPanelService,
  isInactive: boolean
): Promise<void> {
  // Find the most recent non-resolved alert for this (server, service) pair.
  // We only expect at most one non-resolved row per (serverId, type) pair at
  // any time, but findFirst guards against any accidental duplicates.
  const existingAlert = await prisma.sharedHostingAlert.findFirst({
    where: {
      serverId,
      type: service,
      status: { in: ["pending", "active"] }
    },
    orderBy: { triggeredAt: "desc" }
  });

  if (isInactive) {
    if (!existingAlert) {
      // Cycle 1 of inactivity: create a "pending" sentinel — no notification yet.
      await prisma.sharedHostingAlert.create({
        data: {
          serverId,
          type: service,
          status: "pending",
          triggeredAt: new Date()
        }
      });
      console.info(
        `[cyberpanel-alert] pending serverId=${serverId} service=${service}`
      );
      return;
    }

    if (existingAlert.status === "pending") {
      // Cycle 2 of inactivity: debounce passed — promote to "active" and notify.
      await prisma.sharedHostingAlert.update({
        where: { id: existingAlert.id },
        data: {
          status: "active",
          triggeredAt: new Date(), // stamp when the alert officially fired
          lastNotifiedAt: new Date(),
          notificationCount: { increment: 1 }
        }
      });

      console.info(
        `[cyberpanel-alert] active serverId=${serverId} service=${service}`
      );

      try {
        await sendSharedHostingAlertNotification(prisma, env, {
          serverName,
          serviceName: service,
          alertStatus: "active"
        });
      } catch {
        // Non-fatal — notification failure must not affect alert row state.
      }
      return;
    }

    // status === "active": already alerting. No repeat notifications per cycle;
    // the existing repeat-notification mechanism (if added in future stories)
    // would handle re-notification. For now, one notification per state change.
  } else {
    // Service is active (healthy).

    if (!existingAlert) {
      // Nothing to do — already healthy and no open alert.
      return;
    }

    if (existingAlert.status === "pending") {
      // Single-cycle blip: service recovered before the debounce completed.
      // Delete the pending row — no alert was ever sent, so no resolution needed.
      await prisma.sharedHostingAlert.delete({
        where: { id: existingAlert.id }
      });
      console.info(
        `[cyberpanel-alert] blip-cleared serverId=${serverId} service=${service}`
      );
      return;
    }

    // status === "active": service was down and is now recovered — auto-resolve.
    await prisma.sharedHostingAlert.update({
      where: { id: existingAlert.id },
      data: {
        status: "resolved",
        resolvedAt: new Date()
      }
    });

    console.info(
      `[cyberpanel-alert] resolved serverId=${serverId} service=${service}`
    );

    try {
      await sendSharedHostingAlertNotification(prisma, env, {
        serverName,
        serviceName: service,
        alertStatus: "resolved"
      });
    } catch {
      // Non-fatal
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Evaluate CyberPanel service alerts for a single server immediately after
 * syncCyberPanel() succeeds.
 *
 * Reads serviceStatus from any one enabled SharedHostingDomain row for this
 * server (all domains carry an identical server-wide snapshot — see EMS-23
 * trade-off note). If no domain has a serviceStatus blob yet, the function
 * returns early without creating any alerts.
 *
 * Never throws — per-service errors are caught individually so one service
 * failure cannot abort evaluation of the others.
 *
 * @param prisma    Prisma client
 * @param env       Env vars (needed for notification dispatch)
 * @param serverId  SharedHostingServer.id — used for DB queries and log lines
 * @param serverName Human-readable label for notification messages
 */
export async function evaluateCyberPanelAlerts(
  prisma: PrismaClient,
  env: Env,
  serverId: string,
  serverName: string
): Promise<void> {
  // Fetch the serviceStatus blob from one enabled domain on this server.
  // All domains share the same value (EMS-23 design), so any row will do.
  const domainRow = await prisma.sharedHostingDomain.findFirst({
    where: {
      sharedHosting: { serverId },
      serviceStatus: { not: null }
    },
    select: { serviceStatus: true }
  });

  if (!domainRow?.serviceStatus) {
    // No serviceStatus written yet (e.g., first sync failed or non-cyberpanel).
    return;
  }

  const statusMap = parseServiceStatus(domainRow.serviceStatus);
  if (!statusMap) {
    // Structurally invalid blob — log and skip rather than crashing.
    console.warn(
      `[cyberpanel-alert] invalid-service-status serverId=${serverId}`
    );
    return;
  }

  // Evaluate each service independently; catch per-service to maximise
  // resilience — a DB error on one service must not suppress the others.
  for (const service of CYBERPANEL_SERVICES) {
    try {
      await evaluateService(
        prisma,
        env,
        serverId,
        serverName,
        service,
        statusMap[service] === "inactive"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 200) : "unknown";
      console.error(
        `[cyberpanel-alert] eval-error serverId=${serverId} service=${service} error="${msg}"`
      );
    }
  }
}
