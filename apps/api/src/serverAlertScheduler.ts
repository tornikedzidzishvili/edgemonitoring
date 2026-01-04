import type { PrismaClient, Server, ServerAlertConfig, ServerAlert, ServerAlertSettings } from "@prisma/client";
import type { Env } from "./env.js";
import { sendServerAlertNotification } from "./alerts.js";

type ServerWithConfig = Server & {
  alertConfig: ServerAlertConfig | null;
  alerts: ServerAlert[];
};

type EffectiveSettings = {
  cpuThresholdPct: number;
  cpuDurationMin: number;
  ramThresholdPct: number;
  ramDurationMin: number;
  offlineTimeoutMin: number;
};

async function getOrCreateGlobalSettings(prisma: PrismaClient): Promise<ServerAlertSettings> {
  let settings = await prisma.serverAlertSettings.findFirst();
  if (!settings) {
    settings = await prisma.serverAlertSettings.create({
      data: {
        cpuThresholdPct: 90,
        cpuDurationMin: 5,
        ramThresholdPct: 90,
        ramDurationMin: 5,
        offlineTimeoutMin: 3
      }
    });
  }
  return settings;
}

function resolveEffectiveSettings(
  config: ServerAlertConfig | null,
  global: ServerAlertSettings
): EffectiveSettings {
  return {
    cpuThresholdPct: config?.cpuThresholdPct ?? global.cpuThresholdPct,
    cpuDurationMin: config?.cpuDurationMin ?? global.cpuDurationMin,
    ramThresholdPct: config?.ramThresholdPct ?? global.ramThresholdPct,
    ramDurationMin: config?.ramDurationMin ?? global.ramDurationMin,
    offlineTimeoutMin: config?.offlineTimeoutMin ?? global.offlineTimeoutMin
  };
}

async function createAlert(
  prisma: PrismaClient,
  env: Env,
  params: {
    serverId: string;
    serverName: string;
    type: "cpu" | "ram" | "offline";
    thresholdValue: number | null;
    actualValue: number | null;
  }
): Promise<void> {
  const alert = await prisma.serverAlert.create({
    data: {
      serverId: params.serverId,
      type: params.type,
      thresholdValue: params.thresholdValue,
      actualValue: params.actualValue,
      status: "active",
      lastNotifiedAt: new Date(),
      notificationCount: 1
    }
  });

  // Send first notification
  try {
    await sendServerAlertNotification(prisma, env, {
      alertId: alert.id,
      serverName: params.serverName,
      alertType: params.type,
      thresholdValue: params.thresholdValue,
      actualValue: params.actualValue,
      isRepeat: false
    });
  } catch {
    // Non-fatal
  }
}

async function autoResolveAlert(prisma: PrismaClient, alertId: string): Promise<void> {
  await prisma.serverAlert.update({
    where: { id: alertId },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedById: null // auto-resolved
    }
  });
}

async function checkCpuAlert(
  prisma: PrismaClient,
  env: Env,
  server: ServerWithConfig,
  settings: EffectiveSettings
): Promise<void> {
  const sinceMinutes = new Date(Date.now() - settings.cpuDurationMin * 60 * 1000);

  const metrics = await prisma.serverMetricMinute.findMany({
    where: {
      serverId: server.id,
      minuteStart: { gte: sinceMinutes }
    }
  });

  if (metrics.length === 0) return;

  const totalSamples = metrics.reduce((sum, m) => sum + m.samples, 0);
  if (totalSamples === 0) return;

  const avgCpu = metrics.reduce((sum, m) => sum + m.cpuLoadSum, 0) / totalSamples;

  const existingAlert = server.alerts.find((a) => a.type === "cpu" && a.status === "active");

  if (avgCpu >= settings.cpuThresholdPct) {
    if (!existingAlert) {
      await createAlert(prisma, env, {
        serverId: server.id,
        serverName: server.name,
        type: "cpu",
        thresholdValue: settings.cpuThresholdPct,
        actualValue: Math.round(avgCpu * 10) / 10
      });
    }
  } else if (existingAlert) {
    await autoResolveAlert(prisma, existingAlert.id);
  }
}

async function checkRamAlert(
  prisma: PrismaClient,
  env: Env,
  server: ServerWithConfig,
  settings: EffectiveSettings
): Promise<void> {
  const sinceMinutes = new Date(Date.now() - settings.ramDurationMin * 60 * 1000);

  const metrics = await prisma.serverMetricMinute.findMany({
    where: {
      serverId: server.id,
      minuteStart: { gte: sinceMinutes }
    }
  });

  if (metrics.length === 0) return;

  const totalSamples = metrics.reduce((sum, m) => sum + m.samples, 0);
  if (totalSamples === 0) return;

  const avgRam = metrics.reduce((sum, m) => sum + m.memUsedPctSum, 0) / totalSamples;

  const existingAlert = server.alerts.find((a) => a.type === "ram" && a.status === "active");

  if (avgRam >= settings.ramThresholdPct) {
    if (!existingAlert) {
      await createAlert(prisma, env, {
        serverId: server.id,
        serverName: server.name,
        type: "ram",
        thresholdValue: settings.ramThresholdPct,
        actualValue: Math.round(avgRam * 10) / 10
      });
    }
  } else if (existingAlert) {
    await autoResolveAlert(prisma, existingAlert.id);
  }
}

async function checkOfflineAlert(
  prisma: PrismaClient,
  env: Env,
  server: ServerWithConfig,
  settings: EffectiveSettings
): Promise<void> {
  const offlineThreshold = new Date(Date.now() - settings.offlineTimeoutMin * 60 * 1000);

  const isOffline = !server.lastSeenAt || server.lastSeenAt < offlineThreshold;
  const existingAlert = server.alerts.find((a) => a.type === "offline" && a.status === "active");

  if (isOffline) {
    if (!existingAlert) {
      await createAlert(prisma, env, {
        serverId: server.id,
        serverName: server.name,
        type: "offline",
        thresholdValue: settings.offlineTimeoutMin,
        actualValue: null
      });
    }
  } else if (existingAlert) {
    // Server is back online - auto-resolve
    await autoResolveAlert(prisma, existingAlert.id);
  }
}

async function sendRepeatNotifications(prisma: PrismaClient, env: Env): Promise<void> {
  const repeatIntervalMs = 30 * 60 * 1000; // 30 minutes
  const repeatThreshold = new Date(Date.now() - repeatIntervalMs);

  const alertsNeedingRepeat = await prisma.serverAlert.findMany({
    where: {
      status: "active",
      lastNotifiedAt: { lt: repeatThreshold }
    },
    include: { server: true }
  });

  for (const alert of alertsNeedingRepeat) {
    try {
      await sendServerAlertNotification(prisma, env, {
        alertId: alert.id,
        serverName: alert.server.name,
        alertType: alert.type as "cpu" | "ram" | "offline",
        thresholdValue: alert.thresholdValue,
        actualValue: alert.actualValue,
        isRepeat: true
      });

      await prisma.serverAlert.update({
        where: { id: alert.id },
        data: {
          lastNotifiedAt: new Date(),
          notificationCount: { increment: 1 }
        }
      });
    } catch {
      // Non-fatal
    }
  }
}

export function startServerAlertScheduler(prisma: PrismaClient, env: Env): void {
  const intervalMs = 60 * 1000; // Check every minute

  const runOnce = async () => {
    const globalSettings = await getOrCreateGlobalSettings(prisma);

    // Get all servers with alerting enabled
    const servers = (await prisma.server.findMany({
      where: {
        alertConfig: {
          alertingEnabled: true
        }
      },
      include: {
        alertConfig: true,
        alerts: {
          where: { status: "active" }
        }
      }
    })) as ServerWithConfig[];

    for (const server of servers) {
      const effectiveSettings = resolveEffectiveSettings(server.alertConfig, globalSettings);

      try {
        await checkCpuAlert(prisma, env, server, effectiveSettings);
      } catch {
        // Non-fatal
      }

      try {
        await checkRamAlert(prisma, env, server, effectiveSettings);
      } catch {
        // Non-fatal
      }

      try {
        await checkOfflineAlert(prisma, env, server, effectiveSettings);
      } catch {
        // Non-fatal
      }
    }

    // Send repeat notifications for active alerts (every 30 min)
    try {
      await sendRepeatNotifications(prisma, env);
    } catch {
      // Non-fatal
    }
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
