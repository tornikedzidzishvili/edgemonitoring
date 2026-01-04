import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../middleware/sessionAuth.js";

export async function serverAlertsRoutes(app: FastifyInstance) {
  // Get global server alert settings (admin only)
  app.get("/settings/server-alerts", { preHandler: requireAdmin }, async () => {
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

    return {
      settings: {
        id: settings.id,
        cpuThresholdPct: settings.cpuThresholdPct,
        cpuDurationMin: settings.cpuDurationMin,
        ramThresholdPct: settings.ramThresholdPct,
        ramDurationMin: settings.ramDurationMin,
        offlineTimeoutMin: settings.offlineTimeoutMin,
        updatedAt: settings.updatedAt
      }
    };
  });

  // Update global server alert settings (admin only)
  app.post("/settings/server-alerts", { preHandler: requireAdmin }, async (req) => {
    const body = z
      .object({
        cpuThresholdPct: z.coerce.number().int().min(1).max(100).optional(),
        cpuDurationMin: z.coerce.number().int().min(1).max(60).optional(),
        ramThresholdPct: z.coerce.number().int().min(1).max(100).optional(),
        ramDurationMin: z.coerce.number().int().min(1).max(60).optional(),
        offlineTimeoutMin: z.coerce.number().int().min(1).max(60).optional()
      })
      .parse(req.body);

    let existing = await prisma.serverAlertSettings.findFirst();

    const data = {
      ...(body.cpuThresholdPct !== undefined ? { cpuThresholdPct: body.cpuThresholdPct } : {}),
      ...(body.cpuDurationMin !== undefined ? { cpuDurationMin: body.cpuDurationMin } : {}),
      ...(body.ramThresholdPct !== undefined ? { ramThresholdPct: body.ramThresholdPct } : {}),
      ...(body.ramDurationMin !== undefined ? { ramDurationMin: body.ramDurationMin } : {}),
      ...(body.offlineTimeoutMin !== undefined ? { offlineTimeoutMin: body.offlineTimeoutMin } : {})
    };

    let settings;
    if (existing) {
      settings = await prisma.serverAlertSettings.update({
        where: { id: existing.id },
        data
      });
    } else {
      settings = await prisma.serverAlertSettings.create({
        data: {
          cpuThresholdPct: body.cpuThresholdPct ?? 90,
          cpuDurationMin: body.cpuDurationMin ?? 5,
          ramThresholdPct: body.ramThresholdPct ?? 90,
          ramDurationMin: body.ramDurationMin ?? 5,
          offlineTimeoutMin: body.offlineTimeoutMin ?? 3
        }
      });
    }

    return {
      settings: {
        id: settings.id,
        cpuThresholdPct: settings.cpuThresholdPct,
        cpuDurationMin: settings.cpuDurationMin,
        ramThresholdPct: settings.ramThresholdPct,
        ramDurationMin: settings.ramDurationMin,
        offlineTimeoutMin: settings.offlineTimeoutMin,
        updatedAt: settings.updatedAt
      }
    };
  });

  // Get server alert config (admin only)
  app.get("/servers/:id/alert-config", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const server = await prisma.server.findUnique({ where: { id: params.id } });
    if (!server) throw app.httpErrors.notFound("server-not-found");

    let config = await prisma.serverAlertConfig.findUnique({ where: { serverId: params.id } });

    // Get global settings for effective values
    let globalSettings = await prisma.serverAlertSettings.findFirst();
    if (!globalSettings) {
      globalSettings = await prisma.serverAlertSettings.create({
        data: {
          cpuThresholdPct: 90,
          cpuDurationMin: 5,
          ramThresholdPct: 90,
          ramDurationMin: 5,
          offlineTimeoutMin: 3
        }
      });
    }

    return {
      alertingEnabled: config?.alertingEnabled ?? false,
      cpuThresholdPct: config?.cpuThresholdPct ?? null,
      cpuDurationMin: config?.cpuDurationMin ?? null,
      ramThresholdPct: config?.ramThresholdPct ?? null,
      ramDurationMin: config?.ramDurationMin ?? null,
      offlineTimeoutMin: config?.offlineTimeoutMin ?? null,
      effectiveSettings: {
        cpuThresholdPct: config?.cpuThresholdPct ?? globalSettings.cpuThresholdPct,
        cpuDurationMin: config?.cpuDurationMin ?? globalSettings.cpuDurationMin,
        ramThresholdPct: config?.ramThresholdPct ?? globalSettings.ramThresholdPct,
        ramDurationMin: config?.ramDurationMin ?? globalSettings.ramDurationMin,
        offlineTimeoutMin: config?.offlineTimeoutMin ?? globalSettings.offlineTimeoutMin
      }
    };
  });

  // Update server alert config (admin only)
  app.post("/servers/:id/alert-config", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z
      .object({
        alertingEnabled: z.boolean().optional(),
        cpuThresholdPct: z.coerce.number().int().min(1).max(100).nullable().optional(),
        cpuDurationMin: z.coerce.number().int().min(1).max(60).nullable().optional(),
        ramThresholdPct: z.coerce.number().int().min(1).max(100).nullable().optional(),
        ramDurationMin: z.coerce.number().int().min(1).max(60).nullable().optional(),
        offlineTimeoutMin: z.coerce.number().int().min(1).max(60).nullable().optional()
      })
      .parse(req.body);

    const server = await prisma.server.findUnique({ where: { id: params.id } });
    if (!server) throw app.httpErrors.notFound("server-not-found");

    const existing = await prisma.serverAlertConfig.findUnique({ where: { serverId: params.id } });

    const data = {
      ...(body.alertingEnabled !== undefined ? { alertingEnabled: body.alertingEnabled } : {}),
      ...(body.cpuThresholdPct !== undefined ? { cpuThresholdPct: body.cpuThresholdPct } : {}),
      ...(body.cpuDurationMin !== undefined ? { cpuDurationMin: body.cpuDurationMin } : {}),
      ...(body.ramThresholdPct !== undefined ? { ramThresholdPct: body.ramThresholdPct } : {}),
      ...(body.ramDurationMin !== undefined ? { ramDurationMin: body.ramDurationMin } : {}),
      ...(body.offlineTimeoutMin !== undefined ? { offlineTimeoutMin: body.offlineTimeoutMin } : {})
    };

    let config;
    if (existing) {
      config = await prisma.serverAlertConfig.update({
        where: { id: existing.id },
        data
      });
    } else {
      config = await prisma.serverAlertConfig.create({
        data: {
          serverId: params.id,
          alertingEnabled: body.alertingEnabled ?? false,
          cpuThresholdPct: body.cpuThresholdPct ?? null,
          cpuDurationMin: body.cpuDurationMin ?? null,
          ramThresholdPct: body.ramThresholdPct ?? null,
          ramDurationMin: body.ramDurationMin ?? null,
          offlineTimeoutMin: body.offlineTimeoutMin ?? null
        }
      });
    }

    // Get global settings for effective values
    let globalSettings = await prisma.serverAlertSettings.findFirst();
    if (!globalSettings) {
      globalSettings = await prisma.serverAlertSettings.create({
        data: {
          cpuThresholdPct: 90,
          cpuDurationMin: 5,
          ramThresholdPct: 90,
          ramDurationMin: 5,
          offlineTimeoutMin: 3
        }
      });
    }

    return {
      alertingEnabled: config.alertingEnabled,
      cpuThresholdPct: config.cpuThresholdPct,
      cpuDurationMin: config.cpuDurationMin,
      ramThresholdPct: config.ramThresholdPct,
      ramDurationMin: config.ramDurationMin,
      offlineTimeoutMin: config.offlineTimeoutMin,
      effectiveSettings: {
        cpuThresholdPct: config.cpuThresholdPct ?? globalSettings.cpuThresholdPct,
        cpuDurationMin: config.cpuDurationMin ?? globalSettings.cpuDurationMin,
        ramThresholdPct: config.ramThresholdPct ?? globalSettings.ramThresholdPct,
        ramDurationMin: config.ramDurationMin ?? globalSettings.ramDurationMin,
        offlineTimeoutMin: config.offlineTimeoutMin ?? globalSettings.offlineTimeoutMin
      }
    };
  });

  // List alerts (with pagination and filtering)
  app.get("/alerts", { preHandler: requireAuth }, async (req) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        status: z.enum(["active", "resolved", "all"]).default("active"),
        serverId: z.string().min(1).optional(),
        type: z.enum(["cpu", "ram", "offline"]).optional()
      })
      .parse(req.query);

    const where: any = {};

    if (query.status !== "all") {
      where.status = query.status;
    }
    if (query.serverId) {
      where.serverId = query.serverId;
    }
    if (query.type) {
      where.type = query.type;
    }

    const [total, alerts] = await Promise.all([
      prisma.serverAlert.count({ where }),
      prisma.serverAlert.findMany({
        where,
        orderBy: { triggeredAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          server: { select: { id: true, name: true } },
          resolvedBy: { select: { id: true, fullName: true } }
        }
      })
    ]);

    const now = Date.now();

    return {
      alerts: alerts.map((a) => ({
        id: a.id,
        server: a.server,
        type: a.type,
        thresholdValue: a.thresholdValue,
        actualValue: a.actualValue,
        status: a.status,
        triggeredAt: a.triggeredAt,
        resolvedAt: a.resolvedAt,
        resolvedBy: a.resolvedBy,
        duration: a.status === "active" ? now - a.triggeredAt.getTime() : (a.resolvedAt?.getTime() ?? now) - a.triggeredAt.getTime(),
        lastNotifiedAt: a.lastNotifiedAt,
        notificationCount: a.notificationCount
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  });

  // Get active alert count (for dashboard widget)
  app.get("/alerts/count", { preHandler: requireAuth }, async () => {
    const [total, cpuCount, ramCount, offlineCount] = await Promise.all([
      prisma.serverAlert.count({ where: { status: "active" } }),
      prisma.serverAlert.count({ where: { status: "active", type: "cpu" } }),
      prisma.serverAlert.count({ where: { status: "active", type: "ram" } }),
      prisma.serverAlert.count({ where: { status: "active", type: "offline" } })
    ]);

    return {
      activeCount: total,
      byType: {
        cpu: cpuCount,
        ram: ramCount,
        offline: offlineCount
      }
    };
  });

  // Resolve an alert manually
  app.post("/alerts/:id/resolve", { preHandler: requireAuth }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const alert = await prisma.serverAlert.findUnique({ where: { id: params.id } });
    if (!alert) throw app.httpErrors.notFound("alert-not-found");

    if (alert.status === "resolved") {
      return { ok: true, message: "already-resolved" };
    }

    const userId = (req as any).userId as string;

    await prisma.serverAlert.update({
      where: { id: alert.id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        resolvedById: userId
      }
    });

    return { ok: true };
  });

  // Get single alert details
  app.get("/alerts/:id", { preHandler: requireAuth }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const alert = await prisma.serverAlert.findUnique({
      where: { id: params.id },
      include: {
        server: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, fullName: true } }
      }
    });

    if (!alert) throw app.httpErrors.notFound("alert-not-found");

    const now = Date.now();

    return {
      id: alert.id,
      server: alert.server,
      type: alert.type,
      thresholdValue: alert.thresholdValue,
      actualValue: alert.actualValue,
      status: alert.status,
      triggeredAt: alert.triggeredAt,
      resolvedAt: alert.resolvedAt,
      resolvedBy: alert.resolvedBy,
      duration: alert.status === "active" ? now - alert.triggeredAt.getTime() : (alert.resolvedAt?.getTime() ?? now) - alert.triggeredAt.getTime(),
      lastNotifiedAt: alert.lastNotifiedAt,
      notificationCount: alert.notificationCount
    };
  });
}
