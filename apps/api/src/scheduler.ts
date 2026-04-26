import type { PrismaClient } from "@prisma/client";
import type { Env } from "./env.js";
import { checkUrl } from "./uptimeChecker.js";
import { checkDomainHttp, checkDomainDns, checkSslCertificate } from "./domainChecker.js";
import { sendWebAppDownAlerts } from "./alerts.js";
import { syncCyberPanel } from "./services/cyberpanelSync.js";
import { evaluateCyberPanelAlerts } from "./services/cyberpanelAlertEvaluator.js";
import { syncPleskDomains } from "./services/plesk.js";

export function startUptimeScheduler(prisma: PrismaClient, env: Env): void {
  const intervalMs = env.CHECK_INTERVAL_SECONDS * 1000;

  const runOnce = async () => {
    const webApps = (await prisma.webApp.findMany({ where: { enabled: true } })) as unknown as Array<{
      id: string;
      name: string;
      url: string;
    }>;

    await Promise.all(
      webApps.map(async (app) => {
        const prev = await prisma.uptimeCheckResult.findFirst({
          where: { webAppId: app.id },
          orderBy: { checkedAt: "desc" },
          select: { ok: true }
        });

        const result = await checkUrl(app.url, env.CHECK_TIMEOUT_MS);
        await prisma.uptimeCheckResult.create({
          data: {
            webAppId: app.id,
            ok: result.ok,
            httpStatus: result.httpStatus,
            responseTimeMs: result.responseTimeMs,
            error: result.error
          }
        });

        // Alert only on transition from UP -> DOWN
        if (prev?.ok === true && result.ok === false) {
          await sendWebAppDownAlerts(prisma, env, {
            webAppId: app.id,
            httpStatus: result.httpStatus ?? null,
            error: result.error ?? null
          });
        }
      })
    );
  };

  // fire immediately, then interval
  runOnce().catch(() => {
    // ignore
  });

  setInterval(() => {
    runOnce().catch(() => {
      // ignore
    });
  }, intervalMs).unref();
}

export function startDomainScheduler(prisma: PrismaClient, env: Env): void {
  const intervalMs = env.CHECK_INTERVAL_SECONDS * 1000;
  const sslCheckIntervalMs = 60 * 60 * 1000; // Check SSL every hour
  let lastSslCheck = 0;

  const runOnce = async () => {
    const domains = (await prisma.sharedHostingDomain.findMany({
      where: { enabled: true }
    })) as unknown as Array<{
      id: string;
      domain: string;
      lastKnownIp: string | null;
      sslLastChecked: Date | null;
    }>;

    const now = Date.now();
    const shouldCheckSsl = now - lastSslCheck >= sslCheckIntervalMs;
    if (shouldCheckSsl) {
      lastSslCheck = now;
    }

    await Promise.all(
      domains.map(async (d) => {
        // HTTP check
        const httpResult = await checkDomainHttp(d.domain, env.CHECK_TIMEOUT_MS);

        // DNS check
        const dnsResult = await checkDomainDns(d.domain);
        const ipChanged = d.lastKnownIp !== null && dnsResult.ip !== null && d.lastKnownIp !== dnsResult.ip;

        // Store check result
        await prisma.domainCheckResult.create({
          data: {
            domainId: d.id,
            httpOk: httpResult.ok,
            httpStatus: httpResult.httpStatus,
            responseTimeMs: httpResult.responseTimeMs,
            httpError: httpResult.error,
            currentIp: dnsResult.ip,
            ipChanged
          }
        });

        // Update lastKnownIp if we got a new IP
        if (dnsResult.ip) {
          await prisma.sharedHostingDomain.update({
            where: { id: d.id },
            data: {
              lastKnownIp: dnsResult.ip,
              dnsLastChecked: new Date()
            }
          });
        }

        // SSL check (less frequently)
        if (shouldCheckSsl) {
          const sslResult = await checkSslCertificate(d.domain, env.CHECK_TIMEOUT_MS);
          await prisma.sharedHostingDomain.update({
            where: { id: d.id },
            data: {
              sslExpiresAt: sslResult.expiresAt,
              sslIssuer: sslResult.issuer,
              sslLastChecked: new Date()
            }
          });
        }
      })
    );
  };

  // Fire immediately, then interval
  runOnce().catch(() => {
    // ignore
  });

  setInterval(() => {
    runOnce().catch(() => {
      // ignore
    });
  }, intervalMs).unref();
}

// ---------------------------------------------------------------------------
// Shared-hosting sync scheduler (Plesk + CyberPanel)
// ---------------------------------------------------------------------------

/**
 * Periodically iterates over all enabled SharedHostingServer rows and runs
 * the appropriate sync function based on `server.type`:
 *
 *   "plesk"      → syncPleskDomains (existing HTTP path — unchanged)
 *   "manual"     → syncPleskDomains (same Plesk HTTP path — unchanged)
 *   "cyberpanel" → syncCyberPanel   (new SSH path — EMS-23)
 *
 * Errors on any individual server are caught and recorded via `lastSyncError`
 * inside the respective sync function; the loop always continues. The two
 * paths are fully independent — a hanging CyberPanel server cannot delay
 * the Plesk path or vice versa (servers are iterated via Promise.all).
 *
 * Sync interval: once per hour (configurable via SHARED_HOSTING_SYNC_INTERVAL_MS
 * env var for testing).
 */
export function startSharedHostingSyncScheduler(prisma: PrismaClient, env: Env): void {
  const intervalMs =
    typeof process.env.SHARED_HOSTING_SYNC_INTERVAL_MS === "string"
      ? parseInt(process.env.SHARED_HOSTING_SYNC_INTERVAL_MS, 10) || 3_600_000
      : 3_600_000; // Default: 1 hour

  const runOnce = async (): Promise<void> => {
    const servers = await prisma.sharedHostingServer.findMany({
      where: { enabled: true },
      select: {
        id: true,
        name: true,
        type: true,
        apiUrl: true,
        sshHost: true,
        sshKeyId: true,
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
      servers.map(async (server) => {
        try {
          if (server.type === "cyberpanel") {
            // New SSH-based sync path (EMS-23).
            await syncCyberPanel(prisma, env, server);
            // EMS-27: evaluate service alerts immediately after a successful
            // sync. syncCyberPanel records errors internally and does not throw
            // on failure, so reaching this line means the sync completed (even
            // if it wrote a lastSyncError — we still evaluate because the
            // serviceStatus blob may be fresh from a prior successful sync).
            await evaluateCyberPanelAlerts(prisma, env, server.id, server.name);
          } else {
            // "plesk" and "manual" share the existing HTTP sync path.
            // syncPleskDomains handles its own error recording internally; we
            // still wrap it so an unexpected throw cannot crash the loop.
            await syncPleskDomains(server.id);
          }
        } catch (err) {
          // Last-resort catch: syncCyberPanel and syncPleskDomains already
          // record errors internally, but guard the loop in case of an
          // unexpected outer throw (e.g. Prisma connectivity loss on the
          // lastSyncError update itself).
          const safeMessage =
            err instanceof Error ? err.message.slice(0, 200) : "unknown-error";
          console.error(
            `[shared-hosting-sync] unhandled serverId=${server.id} error="${safeMessage}"`
          );
        }
      })
    );
  };

  // Fire immediately on startup, then on each interval tick.
  runOnce().catch(() => {
    // Top-level catch: prevent unhandled rejection if the very first run
    // fails (e.g., DB not yet ready at startup).
  });

  setInterval(() => {
    runOnce().catch(() => {
      // ignore — per-server errors are already handled inside runOnce
    });
  }, intervalMs).unref();
}
