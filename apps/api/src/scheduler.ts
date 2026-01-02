import type { PrismaClient } from "@prisma/client";
import type { Env } from "./env.js";
import { checkUrl } from "./uptimeChecker.js";

export function startUptimeScheduler(prisma: PrismaClient, env: Env): void {
  const intervalMs = env.CHECK_INTERVAL_SECONDS * 1000;

  const runOnce = async () => {
    const webApps = (await prisma.webApp.findMany({ where: { enabled: true } })) as unknown as Array<{
      id: string;
      url: string;
    }>;

    await Promise.all(
      webApps.map(async (app) => {
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
