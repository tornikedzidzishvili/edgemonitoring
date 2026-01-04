import type { PrismaClient } from "@prisma/client";
import type { Env } from "./env.js";
import { checkUrl } from "./uptimeChecker.js";
import { checkDomainHttp, checkDomainDns, checkSslCertificate } from "./domainChecker.js";
import { sendWebAppDownAlerts } from "./alerts.js";

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
