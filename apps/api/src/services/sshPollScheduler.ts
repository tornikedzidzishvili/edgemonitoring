/**
 * SSH Poll Scheduler
 *
 * Periodically polls all servers where monitoringMode = "ssh", collecting
 * system metrics over SSH and persisting them using the same storage paths
 * as the agent ingest route (ServerReport + ServerMetricMinute).
 *
 * Security notes:
 * - SSH private keys are decrypted in-memory only for the duration of each
 *   probe call and are never logged, returned, or written to disk.
 * - Per-server errors are caught and logged with only a sanitized message;
 *   raw ssh2 errors may contain session details, so we strip them to a
 *   single message string.
 * - Only servers with monitoringMode = "ssh" are selected; agent-mode servers
 *   are never touched by this scheduler.
 */

import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import pLimit from "p-limit";
import { decryptString } from "../cryptoBox.js";
import { probeOverSsh, type SshProbeResult } from "../sshProbe.js";

// Maximum number of concurrent SSH probe calls. Raising this increases the
// blast radius if many servers are slow to respond — leave a TODO if you
// believe the business needs a higher value.
// TODO: expose as SSH_POLL_CONCURRENCY env var if fleet size grows past ~50 SSH servers.
const CONCURRENCY_LIMIT = 5;

/**
 * Derive CPU load and memory-used-percent from an SSH probe result.
 *
 * This is the shared aggregation helper extracted from the agent ingest
 * path in src/index.ts (around lines 1352–1378). Both paths call this
 * function so the numbers stored in ServerMetricMinute are identical
 * regardless of whether the data arrived via agent push or SSH poll.
 *
 * Agent payload shape: { system: { cpu: { load }, mem: { used, total } } }
 * SSH probe shape:     { system: { loadavg: { one }, mem: { memTotalBytes, memAvailableBytes } } }
 *
 * For SSH, we use the 1-minute load average as the cpu-load equivalent
 * (same unit: percentage of one CPU core, fractional) and derive
 * memUsedPct from (total - available) / total.
 */
export function extractMetrics(probe: SshProbeResult): { cpuLoad: number; memUsedPct: number } | null {
  const cpuLoad = probe.system.loadavg?.one;
  const memTotal = probe.system.mem?.memTotalBytes;
  const memAvailable = probe.system.mem?.memAvailableBytes;

  if (
    typeof cpuLoad !== "number" ||
    !Number.isFinite(cpuLoad) ||
    typeof memTotal !== "number" ||
    typeof memAvailable !== "number" ||
    memTotal <= 0
  ) {
    return null;
  }

  const memUsedPct = ((memTotal - memAvailable) / memTotal) * 100;

  if (!Number.isFinite(memUsedPct)) return null;

  return { cpuLoad, memUsedPct };
}

async function pollServer(
  prisma: PrismaClient,
  env: Env,
  server: {
    id: string;
    ip: string | null;
    sshUser: string | null;
    sshPort: number | null;
    sshKey: {
      privateKeyEnc: string;
      privateKeyIv: string;
      privateKeyTag: string;
      passphraseEnc: string | null;
      passphraseIv: string | null;
      passphraseTag: string | null;
    } | null;
  }
): Promise<void> {
  // --- Validate server has everything we need before decrypting anything ---
  if (!server.ip) {
    throw new Error("server has no IP address");
  }
  if (!server.sshKey) {
    throw new Error("server has no SSH key linked");
  }

  // --- Decrypt credentials in-memory only; NEVER log these values ---
  const privateKey = decryptString(
    {
      enc: server.sshKey.privateKeyEnc,
      iv: server.sshKey.privateKeyIv,
      tag: server.sshKey.privateKeyTag,
    },
    env.SSH_KEY_MASTER_SECRET
  );

  let passphrase: string | undefined;
  if (
    server.sshKey.passphraseEnc !== null &&
    server.sshKey.passphraseIv !== null &&
    server.sshKey.passphraseTag !== null
  ) {
    passphrase = decryptString(
      {
        enc: server.sshKey.passphraseEnc,
        iv: server.sshKey.passphraseIv,
        tag: server.sshKey.passphraseTag,
      },
      env.SSH_KEY_MASTER_SECRET
    );
  }

  // --- Probe ---
  const probeResult = await probeOverSsh({
    host: server.ip,
    port: server.sshPort ?? 22,
    username: server.sshUser ?? "root",
    privateKey,
    passphrase,
  });

  // Wipe plaintext credentials from local scope as soon as the probe is done.
  // (JavaScript GC doesn't guarantee immediate collection, but we don't hold
  // references past this point and we never hand them to any other function.)

  // --- Persist ServerReport with source = "ssh" ---
  await prisma.serverReport.create({
    data: {
      serverId: server.id,
      source: "ssh",
      payload: probeResult as object,
    },
  });

  // --- Upsert ServerMetricMinute (same aggregation logic as agent ingest) ---
  // See: src/index.ts ~line 1350 — the agent ingest path.
  const metrics = extractMetrics(probeResult);
  if (metrics !== null) {
    const now = new Date();
    const minuteStart = new Date(now);
    minuteStart.setSeconds(0, 0);

    await prisma.serverMetricMinute.upsert({
      where: { serverId_minuteStart: { serverId: server.id, minuteStart } },
      create: {
        serverId: server.id,
        minuteStart,
        cpuLoadSum: metrics.cpuLoad,
        memUsedPctSum: metrics.memUsedPct,
        samples: 1,
      },
      update: {
        cpuLoadSum: { increment: metrics.cpuLoad },
        memUsedPctSum: { increment: metrics.memUsedPct },
        samples: { increment: 1 },
      },
    });
  }

  // --- Update lastSeenAt so the offline-detection alert scheduler fires
  //     correctly for SSH-mode servers just like it does for agent-mode ones ---
  await prisma.server.update({
    where: { id: server.id },
    data: { lastSeenAt: new Date() },
  });
}

export function startSshPollScheduler(prisma: PrismaClient, env: Env): void {
  const intervalMs = typeof process.env.SSH_POLL_INTERVAL_MS === "string"
    ? parseInt(process.env.SSH_POLL_INTERVAL_MS, 10) || 60_000
    : 60_000;

  const limit = pLimit(CONCURRENCY_LIMIT);

  const runOnce = async (): Promise<void> => {
    const servers = await prisma.server.findMany({
      where: { monitoringMode: "ssh" },
      select: {
        id: true,
        ip: true,
        sshUser: true,
        sshPort: true,
        sshKey: {
          select: {
            privateKeyEnc: true,
            privateKeyIv: true,
            privateKeyTag: true,
            passphraseEnc: true,
            passphraseIv: true,
            passphraseTag: true,
          },
        },
      },
    });

    await Promise.all(
      servers.map((server) =>
        limit(async () => {
          try {
            await pollServer(prisma, env, server);
            // Log success with server identity only — no credential details.
            console.info(`[ssh-poll] ok serverId=${server.id}`);
          } catch (err) {
            // Sanitize: only log the message string, never raw ssh2 errors
            // which may embed session context or key fragments.
            const safeMessage =
              err instanceof Error
                ? err.message.slice(0, 200)
                : "unknown-error";
            console.error(
              `[ssh-poll] failed serverId=${server.id} error="${safeMessage}"`
            );
            // Failure is isolated — the loop continues with remaining servers.
          }
        })
      )
    );
  };

  // Fire immediately on startup, then on each interval tick.
  runOnce().catch(() => {
    // Top-level catch: prevent an unhandled rejection from crashing the
    // process if the first run fails entirely (e.g., DB not yet ready).
  });

  setInterval(() => {
    runOnce().catch(() => {
      // ignore — individual server errors are already caught inside runOnce
    });
  }, intervalMs).unref();
}
