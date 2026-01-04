import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { z } from "zod";
import { prisma } from "./db.js";
import { getEnv } from "./env.js";
import { getAgentKeyHash } from "./auth.js";
import { generateApiKey, hashApiKey } from "./security.js";
import { startUptimeScheduler, startDomainScheduler } from "./scheduler.js";
import { getSslStatus } from "./domainChecker.js";
import { probeOverSsh } from "./sshProbe.js";
import { decryptString, encryptString } from "./cryptoBox.js";
import { authRoutes } from "./routes/auth.js";
import { usersRoutes } from "./routes/users.js";
import { settingsRoutes } from "./routes/settings.js";
import { cleanExpiredSessions } from "./services/userAuth.js";

const env = getEnv();
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(sensible);

// Register auth and settings routes
await app.register(authRoutes);
await app.register(usersRoutes);
await app.register(settingsRoutes);

// Clean expired sessions periodically (every hour)
setInterval(() => {
  cleanExpiredSessions().catch(() => {});
}, 60 * 60 * 1000);

// Cleanup server metrics history (keep last 30 days)
setInterval(() => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  prisma.serverMetricMinute
    .deleteMany({ where: { minuteStart: { lt: cutoff } } })
    .catch(() => {
      // ignore
    });
}, 6 * 60 * 60 * 1000);

app.get("/health", async () => ({ ok: true }));

app.get("/servers", async () => {
  const servers = await prisma.server.findMany({ orderBy: { createdAt: "desc" } });
  return servers.map((s) => ({
    id: s.id,
    name: s.name,
    ip: s.ip,
    vendor: s.vendor,
    specs: s.specs,
    sshUser: s.sshUser,
    sshPort: s.sshPort,
    sshKeyId: s.sshKeyId,
    lastSeenAt: s.lastSeenAt,
    createdAt: s.createdAt
  }));
});

app.get("/servers/dashboard", async (req) => {
  const query = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .parse(req.query);

  const now = Date.now();
  const activeWindowMs = 5 * 60 * 1000;
  const activeThreshold = new Date(now - activeWindowMs);
  const since12h = new Date(now - 12 * 60 * 60 * 1000);
  const bucketMs = 30 * 60 * 1000; // 30-minute buckets for 12 hours = 24 buckets

  const [totalCount, servers] = await Promise.all([
    prisma.server.count(),
    prisma.server.findMany({
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit
    })
  ]);

  const allServers = await prisma.server.findMany({ select: { lastSeenAt: true } });
  const activeCount = allServers.filter((s) => s.lastSeenAt && s.lastSeenAt >= activeThreshold).length;

  const serverIds = servers.map((s) => s.id);
  const reports = await prisma.serverReport.findMany({
    where: {
      serverId: { in: serverIds },
      reportedAt: { gte: since12h }
    },
    orderBy: { reportedAt: "asc" },
    select: { serverId: true, reportedAt: true }
  });

  // Group reports by server
  const reportsByServer = new Map<string, Date[]>();
  for (const r of reports) {
    const arr = reportsByServer.get(r.serverId) ?? [];
    arr.push(r.reportedAt);
    reportsByServer.set(r.serverId, arr);
  }

  // Build 24 buckets for last 12 hours
  const bucketCount = 24;
  const bucketStartTime = Math.floor(since12h.getTime() / bucketMs) * bucketMs;

  const serversWithUptime = servers.map((s) => {
    const serverReports = reportsByServer.get(s.id) ?? [];
    const isActive = s.lastSeenAt && s.lastSeenAt >= activeThreshold;

    // Build bucket array: true if there was at least one report in that bucket
    const buckets: boolean[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = bucketStartTime + i * bucketMs;
      const bucketEnd = bucketStart + bucketMs;
      const hasReport = serverReports.some((r) => {
        const t = r.getTime();
        return t >= bucketStart && t < bucketEnd;
      });
      buckets.push(hasReport);
    }

    // Calculate uptime duration (how long since createdAt or first seen)
    const uptimeMs = s.lastSeenAt ? now - s.createdAt.getTime() : 0;

    return {
      id: s.id,
      name: s.name,
      ip: s.ip,
      vendor: s.vendor,
      isActive,
      lastSeenAt: s.lastSeenAt,
      createdAt: s.createdAt,
      uptimeMs,
      buckets // 24 booleans for last 12h (30-min each)
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / query.limit)
    },
    summary: {
      total: totalCount,
      active: activeCount,
      activeWindowSeconds: Math.floor(activeWindowMs / 1000)
    },
    servers: serversWithUptime
  };
});

app.get("/servers/:id", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) throw app.httpErrors.notFound("server-not-found");

  const latestReport = await prisma.serverReport.findFirst({ where: { serverId: server.id }, orderBy: { reportedAt: "desc" } });

  return {
    id: server.id,
    name: server.name,
    ip: server.ip,
    vendor: server.vendor,
    specs: server.specs,
    sshUser: server.sshUser,
    sshPort: server.sshPort,
    sshKeyId: server.sshKeyId,
    lastSeenAt: server.lastSeenAt,
    createdAt: server.createdAt,
    latestReport: latestReport ? { reportedAt: latestReport.reportedAt, payload: latestReport.payload } : null
  };
});

app.get("/servers/:id/metrics", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const query = z
    .object({
      days: z.coerce.number().int().min(1).max(30).default(1),
      stepMinutes: z.coerce.number().int().min(1).max(60).default(60)
    })
    .parse(req.query);

  const allowedDays = new Set([1, 5, 15, 30]);
  const allowedSteps = new Set([5, 15, 30, 60]);
  const days = allowedDays.has(query.days) ? query.days : 1;
  const stepMinutes = allowedSteps.has(query.stepMinutes) ? query.stepMinutes : 60;

  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) throw app.httpErrors.notFound("server-not-found");

  const now = Date.now();
  const fromMs = now - days * 24 * 60 * 60 * 1000;
  const bucketMs = stepMinutes * 60 * 1000;
  const fromBucketMs = Math.floor(fromMs / bucketMs) * bucketMs;
  const toBucketMs = Math.floor(now / bucketMs) * bucketMs;

  const rows = await prisma.serverMetricMinute.findMany({
    where: {
      serverId: server.id,
      minuteStart: { gte: new Date(fromBucketMs) }
    },
    orderBy: { minuteStart: "asc" }
  });

  const seriesMap = new Map<number, { cpuSum: number; memSum: number; samples: number }>();
  for (const r of rows) {
    const t = r.minuteStart.getTime();
    const bucket = Math.floor(t / bucketMs) * bucketMs;
    const prev = seriesMap.get(bucket) ?? { cpuSum: 0, memSum: 0, samples: 0 };
    prev.cpuSum += r.cpuLoadSum;
    prev.memSum += r.memUsedPctSum;
    prev.samples += r.samples;
    seriesMap.set(bucket, prev);
  }

  const points: Array<{ t: string; cpuLoad: number | null; memUsedPct: number | null; samples: number }> = [];
  for (let t = fromBucketMs; t <= toBucketMs; t += bucketMs) {
    const agg = seriesMap.get(t);
    const samples = agg?.samples ?? 0;
    points.push({
      t: new Date(t).toISOString(),
      cpuLoad: samples === 0 ? null : agg!.cpuSum / samples,
      memUsedPct: samples === 0 ? null : agg!.memSum / samples,
      samples
    });
  }

  return {
    serverId: server.id,
    generatedAt: new Date().toISOString(),
    from: new Date(fromBucketMs).toISOString(),
    to: new Date(toBucketMs).toISOString(),
    days,
    stepMinutes,
    points
  };
});

// Get endpoints (webapps) for a specific server
app.get("/servers/:id/endpoints", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) throw app.httpErrors.notFound("server-not-found");

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since12h = new Date(now - 12 * 60 * 60 * 1000);
  const bucketMs = 30 * 60 * 1000; // 30-minute buckets

  const endpoints = await prisma.webApp.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" }
  });

  const endpointsWithStats = await Promise.all(
    endpoints.map(async (e) => {
      const lastCheck = await prisma.uptimeCheckResult.findFirst({
        where: { webAppId: e.id },
        orderBy: { checkedAt: "desc" }
      });

      const [total24h, ok24h] = await Promise.all([
        prisma.uptimeCheckResult.count({ where: { webAppId: e.id, checkedAt: { gte: since24h } } }),
        prisma.uptimeCheckResult.count({ where: { webAppId: e.id, checkedAt: { gte: since24h }, ok: true } })
      ]);

      // Build 24 buckets for last 12 hours
      const checks12h = await prisma.uptimeCheckResult.findMany({
        where: { webAppId: e.id, checkedAt: { gte: since12h } },
        orderBy: { checkedAt: "asc" },
        select: { checkedAt: true, ok: true }
      });

      const bucketCount = 24;
      const bucketStartTime = Math.floor(since12h.getTime() / bucketMs) * bucketMs;
      const buckets: (boolean | null)[] = [];

      for (let i = 0; i < bucketCount; i++) {
        const bucketStart = bucketStartTime + i * bucketMs;
        const bucketEnd = bucketStart + bucketMs;
        const checksInBucket = checks12h.filter((c) => {
          const t = c.checkedAt.getTime();
          return t >= bucketStart && t < bucketEnd;
        });

        if (checksInBucket.length === 0) {
          buckets.push(null); // No data
        } else {
          buckets.push(checksInBucket.every((c) => c.ok)); // true if all ok, false if any failed
        }
      }

      return {
        id: e.id,
        name: e.name,
        url: e.url,
        enabled: e.enabled,
        createdAt: e.createdAt,
        lastCheck: lastCheck
          ? {
              checkedAt: lastCheck.checkedAt,
              ok: lastCheck.ok,
              httpStatus: lastCheck.httpStatus,
              responseTimeMs: lastCheck.responseTimeMs,
              error: lastCheck.error
            }
          : null,
        uptime24h: total24h === 0 ? null : ok24h / total24h,
        buckets // 24 buckets for last 12h (null = no data, true = up, false = down)
      };
    })
  );

  return {
    serverId: server.id,
    endpoints: endpointsWithStats
  };
});

// Realtime: server report stream (SSE). Browser will auto-reconnect to keep the connection always up.
app.get("/servers/:id/stream", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) throw app.httpErrors.notFound("server-not-found");

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  reply.hijack();

  let closed = false;
  req.raw.on("close", () => {
    closed = true;
  });

  const writeEvent = (event: string, data: unknown) => {
    if (closed) return;
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let lastReportAtMs = 0;

  const tick = async () => {
    if (closed) return;
    const latest = await prisma.serverReport.findFirst({ where: { serverId: server.id }, orderBy: { reportedAt: "desc" } });
    if (!latest) return;

    const t = latest.reportedAt.getTime();
    if (t <= lastReportAtMs) return;
    lastReportAtMs = t;

    writeEvent("report", {
      server: { id: server.id, name: server.name },
      reportedAt: latest.reportedAt.toISOString(),
      payload: latest.payload
    });
  };

  // Send a hello + first snapshot, then poll for new reports.
  writeEvent("hello", {
    server: { id: server.id, name: server.name },
    now: new Date().toISOString(),
    pollSeconds: 2
  });

  tick().catch(() => {
    // ignore
  });

  const poll = setInterval(() => {
    tick().catch(() => {
      // ignore
    });
  }, 2000);

  const keepAlive = setInterval(() => {
    if (closed) return;
    reply.raw.write(`: keepalive ${Date.now()}\n\n`);
  }, 15000);

  const cleanup = () => {
    clearInterval(poll);
    clearInterval(keepAlive);
    try {
      reply.raw.end();
    } catch {
      // ignore
    }
  };

  req.raw.on("close", cleanup);

  return reply;
});

function normalizeTargetToUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return new URL(withScheme).toString();
}

app.get("/webapps", async () => {
  const webapps = (await prisma.webApp.findMany({ include: { server: true } })) as unknown as Array<{
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    serverId: string | null;
    server: { id: string; name: string } | null;
  }>;

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const withStats = await Promise.all(
    webapps.map(async (w) => {
      const last = await prisma.uptimeCheckResult.findFirst({
        where: { webAppId: w.id },
        orderBy: { checkedAt: "desc" }
      });

      const [c24, ok24] = await Promise.all([
        prisma.uptimeCheckResult.count({ where: { webAppId: w.id, checkedAt: { gte: since24h } } }),
        prisma.uptimeCheckResult.count({ where: { webAppId: w.id, checkedAt: { gte: since24h }, ok: true } })
      ]);
      const [c7, ok7] = await Promise.all([
        prisma.uptimeCheckResult.count({ where: { webAppId: w.id, checkedAt: { gte: since7d } } }),
        prisma.uptimeCheckResult.count({ where: { webAppId: w.id, checkedAt: { gte: since7d }, ok: true } })
      ]);

      const uptime24h = c24 === 0 ? null : ok24 / c24;
      const uptime7d = c7 === 0 ? null : ok7 / c7;

      return {
        id: w.id,
        name: w.name,
        url: w.url,
        enabled: w.enabled,
        server: w.server ? { id: w.server.id, name: w.server.name } : null,
        lastCheck: last
          ? {
              checkedAt: last.checkedAt,
              ok: last.ok,
              httpStatus: last.httpStatus,
              responseTimeMs: last.responseTimeMs,
              error: last.error
            }
          : null,
        uptime24h,
        uptime7d
      };
    })
  );

  return withStats;
});

app.get("/dashboard", async (req) => {
  const query = z
    .object({
      range: z.enum(["24h", "7d", "30d"]).default("24h")
    })
    .parse(req.query);

  const now = Date.now();
  const from =
    query.range === "24h"
      ? new Date(now - 24 * 60 * 60 * 1000)
      : query.range === "7d"
        ? new Date(now - 7 * 24 * 60 * 60 * 1000)
        : new Date(now - 30 * 24 * 60 * 60 * 1000);

  const bucketMs = query.range === "24h" ? 15 * 60 * 1000 : query.range === "7d" ? 2 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;

  const [servers, webapps] = await Promise.all([
    prisma.server.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.webApp.findMany({ include: { server: true } })
  ]);

  const serverActiveWindowMs = 5 * 60 * 1000;
  const serverActiveThreshold = new Date(now - serverActiveWindowMs);
  const activeServers = servers.filter((s) => s.lastSeenAt && s.lastSeenAt >= serverActiveThreshold).length;

  const lastChecks = await Promise.all(
    webapps.map(async (w) =>
      prisma.uptimeCheckResult.findFirst({ where: { webAppId: w.id }, orderBy: { checkedAt: "desc" } })
    )
  );

  const webappCards = webapps.map((w, idx) => {
    const last = lastChecks[idx];
    return {
      id: w.id,
      name: w.name,
      url: w.url,
      enabled: w.enabled,
      server: w.server ? { id: w.server.id, name: w.server.name } : null,
      lastCheck: last
        ? {
            checkedAt: last.checkedAt,
            ok: last.ok,
            httpStatus: last.httpStatus,
            responseTimeMs: last.responseTimeMs,
            error: last.error
          }
        : null
    };
  });

  const webappsUp = webappCards.filter((w) => w.lastCheck?.ok === true).length;
  const webappsDown = webappCards.filter((w) => w.lastCheck?.ok === false).length;
  const webappsUnknown = webappCards.filter((w) => w.lastCheck === null).length;

  const rawChecks = await prisma.uptimeCheckResult.findMany({
    where: { checkedAt: { gte: from } },
    orderBy: { checkedAt: "asc" },
    select: { checkedAt: true, ok: true },
    take: 200_000
  });

  const seriesMap = new Map<number, { total: number; ok: number }>();
  for (const row of rawChecks) {
    const t = row.checkedAt.getTime();
    const bucket = Math.floor(t / bucketMs) * bucketMs;
    const prev = seriesMap.get(bucket) ?? { total: 0, ok: 0 };
    prev.total += 1;
    prev.ok += row.ok ? 1 : 0;
    seriesMap.set(bucket, prev);
  }

  const buckets: Array<{ bucketStart: Date; okPct: number | null; okCount: number; totalCount: number }> = [];
  for (let t = Math.floor(from.getTime() / bucketMs) * bucketMs; t <= now; t += bucketMs) {
    const agg = seriesMap.get(t);
    const total = agg?.total ?? 0;
    const ok = agg?.ok ?? 0;
    buckets.push({
      bucketStart: new Date(t),
      okPct: total === 0 ? null : ok / total,
      okCount: ok,
      totalCount: total
    });
  }

  const recentFailures = await prisma.uptimeCheckResult.findMany({
    where: { ok: false },
    orderBy: { checkedAt: "desc" },
    take: 15,
    include: { webApp: true }
  });

  return {
    generatedAt: new Date().toISOString(),
    range: query.range,
    servers: {
      total: servers.length,
      active: activeServers,
      activeWindowSeconds: Math.floor(serverActiveWindowMs / 1000),
      recent: servers.slice(0, 20).map((s) => ({ id: s.id, name: s.name, vendor: s.vendor, lastSeenAt: s.lastSeenAt }))
    },
    webapps: {
      total: webapps.length,
      up: webappsUp,
      down: webappsDown,
      unknown: webappsUnknown,
      items: webappCards
    },
    uptimeSeries: buckets.map((b) => ({
      bucketStart: b.bucketStart,
      okPct: b.okPct,
      okCount: b.okCount,
      totalCount: b.totalCount
    })),
    recentFailures: recentFailures.map((f) => ({
      webAppId: f.webAppId,
      webAppName: (f.webApp as any)?.name ?? "",
      checkedAt: f.checkedAt,
      httpStatus: f.httpStatus,
      responseTimeMs: f.responseTimeMs,
      error: f.error
    }))
  };
});

app.get("/webapps/:id", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const webapp = await prisma.webApp.findUnique({ where: { id: params.id }, include: { server: true } });
  if (!webapp) throw app.httpErrors.notFound("webapp-not-found");

  const lastCheck = await prisma.uptimeCheckResult.findFirst({
    where: { webAppId: webapp.id },
    orderBy: { checkedAt: "desc" }
  });

  const latestReport = webapp.serverId
    ? await prisma.serverReport.findFirst({ where: { serverId: webapp.serverId }, orderBy: { reportedAt: "desc" } })
    : null;

  return {
    id: webapp.id,
    name: webapp.name,
    url: webapp.url,
    enabled: webapp.enabled,
    server: webapp.server ? { id: webapp.server.id, name: webapp.server.name, lastSeenAt: webapp.server.lastSeenAt } : null,
    lastCheck: lastCheck
      ? {
          checkedAt: lastCheck.checkedAt,
          ok: lastCheck.ok,
          httpStatus: lastCheck.httpStatus,
          responseTimeMs: lastCheck.responseTimeMs,
          error: lastCheck.error
        }
      : null,
    latestReport: latestReport
      ? {
          reportedAt: latestReport.reportedAt,
          payload: latestReport.payload
        }
      : null
  };
});

app.get("/webapps/:id/uptime", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const query = z
    .object({
      range: z.enum(["24h", "7d", "30d"]).default("24h")
    })
    .parse(req.query);

  const now = Date.now();
  const from =
    query.range === "24h"
      ? new Date(now - 24 * 60 * 60 * 1000)
      : query.range === "7d"
        ? new Date(now - 7 * 24 * 60 * 60 * 1000)
        : new Date(now - 30 * 24 * 60 * 60 * 1000);

  const rows = (await prisma.uptimeCheckResult.findMany({
    where: { webAppId: params.id, checkedAt: { gte: from } },
    orderBy: { checkedAt: "asc" },
    take: 5000
  })) as unknown as Array<{
    checkedAt: Date;
    ok: boolean;
    httpStatus: number | null;
    responseTimeMs: number | null;
    error: string | null;
  }>;

  return rows.map((r) => ({
    checkedAt: r.checkedAt,
    ok: r.ok,
    httpStatus: r.httpStatus,
    responseTimeMs: r.responseTimeMs,
    error: r.error
  }));
});

// Admin: create webapp
app.post("/admin/webapps", async (req) => {
  const body = z
    .object({
      name: z.string().min(1),
      url: z.string().min(1),
      serverId: z.string().min(1).optional()
    })
    .parse(req.body);

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeTargetToUrl(body.url);
  } catch {
    throw app.httpErrors.badRequest("invalid-url");
  }

  const created = await prisma.webApp.create({
    data: { name: body.name, url: normalizedUrl, serverId: body.serverId ?? null }
  });

  return created;
});

// Admin: create server + return API key once
app.post("/admin/servers", async (req) => {
  const body = z
    .object({
      name: z.string().min(1),
      ip: z.string().min(1).optional(),
      vendor: z.string().min(1).optional(),
      specs: z.unknown().optional(),
      sshUser: z.string().min(1).optional(),
      sshPort: z.coerce.number().int().positive().optional(),
      sshKeyId: z.string().min(1).optional(),
      createAgentKey: z.boolean().optional()
    })
    .parse(req.body);

  const createAgentKey = body.createAgentKey === true;
  const apiKey = createAgentKey ? generateApiKey() : null;
  const server = await prisma.server.create({
    data: {
      name: body.name,
      ip: body.ip ?? null,
      vendor: body.vendor ?? null,
      specs: (body.specs ?? null) as any,
      sshUser: body.sshUser ?? null,
      sshPort: body.sshPort ?? null,
      sshKeyId: body.sshKeyId ?? null,
      apiKeyHash: apiKey ? hashApiKey(apiKey) : null
    }
  });

  return apiKey ? { server, apiKey } : { server };
});

// Admin: generate/rotate agent API key for an existing server (returned once)
app.post("/admin/servers/:id/agent-key", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) throw app.httpErrors.notFound("server-not-found");

  const apiKey = generateApiKey();
  await prisma.server.update({ where: { id: server.id }, data: { apiKeyHash: hashApiKey(apiKey) } });

  return { serverId: server.id, apiKey };
});

// Admin: update server inventory fields
app.patch("/admin/servers/:id", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      name: z.string().min(1).optional(),
      ip: z.string().min(1).nullable().optional(),
      vendor: z.string().min(1).nullable().optional(),
      specs: z.unknown().nullable().optional(),
      sshUser: z.string().min(1).nullable().optional(),
      sshPort: z.coerce.number().int().positive().nullable().optional(),
      sshKeyId: z.string().min(1).nullable().optional()
    })
    .parse(req.body);

  const updated = await prisma.server.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.ip !== undefined ? { ip: body.ip } : {}),
      ...(body.vendor !== undefined ? { vendor: body.vendor } : {}),
      ...(body.specs !== undefined ? { specs: body.specs as any } : {}),
      ...(body.sshUser !== undefined ? { sshUser: body.sshUser } : {}),
      ...(body.sshPort !== undefined ? { sshPort: body.sshPort } : {}),
      ...(body.sshKeyId !== undefined ? { sshKeyId: body.sshKeyId } : {})
    }
  });

  return {
    id: updated.id,
    name: updated.name,
    ip: updated.ip,
    vendor: updated.vendor,
    specs: updated.specs,
    sshUser: updated.sshUser,
    sshPort: updated.sshPort,
    sshKeyId: updated.sshKeyId,
    lastSeenAt: updated.lastSeenAt,
    createdAt: updated.createdAt
  };
});

// Admin: delete server (keeps webapps, just detaches them)
app.delete("/admin/servers/:id", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) throw app.httpErrors.notFound("server-not-found");

  await prisma.$transaction([
    prisma.webApp.updateMany({ where: { serverId: server.id }, data: { serverId: null } }),
    prisma.serverReport.deleteMany({ where: { serverId: server.id } }),
    prisma.serverMetricMinute.deleteMany({ where: { serverId: server.id } }),
    prisma.server.delete({ where: { id: server.id } })
  ]);

  return { ok: true };
});

// Admin: create SSH key (encrypted at rest; secret never returned)
app.post("/admin/ssh-keys", async (req) => {
  const body = z
    .object({
      name: z.string().min(1),
      privateKey: z.string().min(1),
      passphrase: z.string().optional(),
      username: z.string().min(1).optional(),
      port: z.coerce.number().int().positive().optional()
    })
    .parse(req.body);

  const pk = encryptString(body.privateKey, env.SSH_KEY_MASTER_SECRET);
  const pp = body.passphrase ? encryptString(body.passphrase, env.SSH_KEY_MASTER_SECRET) : null;

  const created = await prisma.sshKey.create({
    data: {
      name: body.name,
      username: body.username ?? null,
      port: body.port ?? null,
      privateKeyEnc: pk.enc,
      privateKeyIv: pk.iv,
      privateKeyTag: pk.tag,
      passphraseEnc: pp?.enc ?? null,
      passphraseIv: pp?.iv ?? null,
      passphraseTag: pp?.tag ?? null
    }
  });

  return {
    id: created.id,
    name: created.name,
    username: created.username,
    port: created.port,
    createdAt: created.createdAt
  };
});

// Admin: list SSH keys (metadata only)
app.get("/admin/ssh-keys", async (req) => {
  const keys = await prisma.sshKey.findMany({ orderBy: { createdAt: "desc" } });
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    username: k.username,
    port: k.port,
    createdAt: k.createdAt
  }));
});

// Admin: update SSH key (re-encrypt if secrets provided)
app.patch("/admin/ssh-keys/:id", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      name: z.string().min(1).optional(),
      username: z.string().min(1).nullable().optional(),
      port: z.coerce.number().int().positive().nullable().optional(),
      privateKey: z.string().min(1).optional(),
      passphrase: z.string().nullable().optional()
    })
    .parse(req.body);

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.username !== undefined) data.username = body.username;
  if (body.port !== undefined) data.port = body.port;

  if (body.privateKey !== undefined) {
    const pk = encryptString(body.privateKey, env.SSH_KEY_MASTER_SECRET);
    data.privateKeyEnc = pk.enc;
    data.privateKeyIv = pk.iv;
    data.privateKeyTag = pk.tag;
  }

  if (body.passphrase !== undefined) {
    if (body.passphrase === null) {
      data.passphraseEnc = null;
      data.passphraseIv = null;
      data.passphraseTag = null;
    } else {
      const pp = encryptString(body.passphrase, env.SSH_KEY_MASTER_SECRET);
      data.passphraseEnc = pp.enc;
      data.passphraseIv = pp.iv;
      data.passphraseTag = pp.tag;
    }
  }

  const updated = await prisma.sshKey.update({ where: { id: params.id }, data: data as any });
  return { id: updated.id, name: updated.name, username: updated.username, port: updated.port, createdAt: updated.createdAt };
});

// Admin: live probe over SSH (uses stored key if server.sshKeyId is set)
app.post("/admin/servers/:id/probe", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      privateKey: z.string().min(1).optional(),
      passphrase: z.string().optional(),
      host: z.string().min(1).optional(),
      port: z.coerce.number().int().positive().optional(),
      username: z.string().min(1).optional(),
      includeDocker: z.boolean().optional(),
      timeoutMs: z.coerce.number().int().positive().optional()
    })
    .parse(req.body);

  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) throw app.httpErrors.notFound("server-not-found");

  const host = body.host ?? server.ip;
  if (!host) throw app.httpErrors.badRequest("missing-server-ip");

  let privateKey = body.privateKey;
  let passphrase = body.passphrase;
  let username = body.username ?? server.sshUser ?? undefined;
  let port = body.port ?? server.sshPort ?? undefined;

  if (!privateKey && server.sshKeyId) {
    const key = await prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
    if (!key) throw app.httpErrors.badRequest("server-ssh-key-not-found");

    privateKey = decryptString(
      { enc: key.privateKeyEnc, iv: key.privateKeyIv, tag: key.privateKeyTag },
      env.SSH_KEY_MASTER_SECRET
    );

    if (passphrase === undefined && key.passphraseEnc && key.passphraseIv && key.passphraseTag) {
      passphrase = decryptString(
        { enc: key.passphraseEnc, iv: key.passphraseIv, tag: key.passphraseTag },
        env.SSH_KEY_MASTER_SECRET
      );
    }

    if (!username && key.username) username = key.username;
    if (!port && key.port) port = key.port;
  }

  if (!privateKey) throw app.httpErrors.badRequest("missing-private-key");
  if (!username) throw app.httpErrors.badRequest("missing-ssh-username");
  port = port ?? 22;

  const result = await probeOverSsh({
    host,
    port,
    username,
    privateKey,
    passphrase,
    timeoutMs: body.timeoutMs,
    includeDocker: body.includeDocker
  });

  return { serverId: server.id, serverName: server.name, ...result };
});

// Agent: submit server report
app.post("/agents/report", async (req) => {
  const agentKeyHash = getAgentKeyHash(req);

  const body = z
    .object({
      serverName: z.string().min(1).optional(),
      payload: z.unknown()
    })
    .parse(req.body);

  const server = await prisma.server.findFirst({ where: { apiKeyHash: agentKeyHash } });
  if (!server) throw app.httpErrors.unauthorized("invalid-agent-key");

  await prisma.server.update({
    where: { id: server.id },
    data: { lastSeenAt: new Date(), name: body.serverName ?? server.name }
  });

  await prisma.serverReport.create({
    data: {
      serverId: server.id,
      payload: body.payload as any
    }
  });

  // Aggregate CPU/memory into per-minute buckets (history for graphs)
  try {
    const p = body.payload as any;
    const cpuLoad = typeof p?.system?.cpu?.load === "number" ? p.system.cpu.load : undefined;
    const memUsed = typeof p?.system?.mem?.used === "number" ? p.system.mem.used : undefined;
    const memTotal = typeof p?.system?.mem?.total === "number" ? p.system.mem.total : undefined;
    const memUsedPct =
      typeof memUsed === "number" && typeof memTotal === "number" && memTotal > 0 ? (memUsed / memTotal) * 100 : undefined;

    if (typeof cpuLoad === "number" && Number.isFinite(cpuLoad) && typeof memUsedPct === "number" && Number.isFinite(memUsedPct)) {
      const now = new Date();
      const minuteStart = new Date(now);
      minuteStart.setSeconds(0, 0);

      await prisma.serverMetricMinute.upsert({
        where: { serverId_minuteStart: { serverId: server.id, minuteStart } },
        create: {
          serverId: server.id,
          minuteStart,
          cpuLoadSum: cpuLoad,
          memUsedPctSum: memUsedPct,
          samples: 1
        },
        update: {
          cpuLoadSum: { increment: cpuLoad },
          memUsedPctSum: { increment: memUsedPct },
          samples: { increment: 1 }
        }
      });
    }
  } catch {
    // Non-fatal
  }

  return { ok: true };
});

// ============ SHARED HOSTING ROUTES ============

// List all shared hosting accounts
app.get("/shared-hosting", async () => {
  const accounts = await prisma.sharedHosting.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      domains: {
        select: {
          id: true,
          domain: true,
          enabled: true,
          sslExpiresAt: true,
          lastKnownIp: true
        }
      }
    }
  });

  return accounts.map((a) => {
    const domainCount = a.domains.length;
    const issuesCount = a.domains.filter((d) => {
      if (!d.enabled) return false;
      const status = getSslStatus(d.sslExpiresAt);
      return status === "critical" || status === "warning";
    }).length;

    return {
      id: a.id,
      name: a.name,
      createdAt: a.createdAt,
      domainCount,
      issuesCount
    };
  });
});

// Get shared hosting account with all domains
app.get("/shared-hosting/:id", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const account = await prisma.sharedHosting.findUnique({
    where: { id: params.id },
    include: {
      domains: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!account) throw app.httpErrors.notFound("shared-hosting-not-found");

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);

  const domainsWithStatus = await Promise.all(
    account.domains.map(async (d) => {
      const lastCheck = await prisma.domainCheckResult.findFirst({
        where: { domainId: d.id },
        orderBy: { checkedAt: "desc" }
      });

      const [total24h, ok24h] = await Promise.all([
        prisma.domainCheckResult.count({ where: { domainId: d.id, checkedAt: { gte: since24h } } }),
        prisma.domainCheckResult.count({ where: { domainId: d.id, checkedAt: { gte: since24h }, httpOk: true } })
      ]);

      return {
        id: d.id,
        domain: d.domain,
        enabled: d.enabled,
        createdAt: d.createdAt,
        sslExpiresAt: d.sslExpiresAt,
        sslIssuer: d.sslIssuer,
        sslStatus: getSslStatus(d.sslExpiresAt),
        sslLastChecked: d.sslLastChecked,
        lastKnownIp: d.lastKnownIp,
        dnsLastChecked: d.dnsLastChecked,
        lastCheck: lastCheck
          ? {
              checkedAt: lastCheck.checkedAt,
              httpOk: lastCheck.httpOk,
              httpStatus: lastCheck.httpStatus,
              responseTimeMs: lastCheck.responseTimeMs,
              httpError: lastCheck.httpError,
              currentIp: lastCheck.currentIp,
              ipChanged: lastCheck.ipChanged
            }
          : null,
        uptime24h: total24h === 0 ? null : ok24h / total24h
      };
    })
  );

  return {
    id: account.id,
    name: account.name,
    createdAt: account.createdAt,
    domains: domainsWithStatus
  };
});

// Get domain check history
app.get("/shared-hosting/:id/domains/:domainId/history", async (req) => {
  const params = z
    .object({
      id: z.string().min(1),
      domainId: z.string().min(1)
    })
    .parse(req.params);

  const query = z
    .object({
      range: z.enum(["24h", "7d", "30d"]).default("24h")
    })
    .parse(req.query);

  const domain = await prisma.sharedHostingDomain.findFirst({
    where: { id: params.domainId, sharedHostingId: params.id }
  });

  if (!domain) throw app.httpErrors.notFound("domain-not-found");

  const now = Date.now();
  const from =
    query.range === "24h"
      ? new Date(now - 24 * 60 * 60 * 1000)
      : query.range === "7d"
        ? new Date(now - 7 * 24 * 60 * 60 * 1000)
        : new Date(now - 30 * 24 * 60 * 60 * 1000);

  const checks = await prisma.domainCheckResult.findMany({
    where: { domainId: domain.id, checkedAt: { gte: from } },
    orderBy: { checkedAt: "asc" },
    take: 5000
  });

  return checks.map((c) => ({
    checkedAt: c.checkedAt,
    httpOk: c.httpOk,
    httpStatus: c.httpStatus,
    responseTimeMs: c.responseTimeMs,
    httpError: c.httpError,
    currentIp: c.currentIp,
    ipChanged: c.ipChanged
  }));
});

// Admin: create shared hosting account
app.post("/admin/shared-hosting", async (req) => {
  const body = z
    .object({
      name: z.string().min(1)
    })
    .parse(req.body);

  const account = await prisma.sharedHosting.create({
    data: { name: body.name }
  });

  return { id: account.id, name: account.name, createdAt: account.createdAt };
});

// Admin: update shared hosting account
app.patch("/admin/shared-hosting/:id", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      name: z.string().min(1).optional()
    })
    .parse(req.body);

  const account = await prisma.sharedHosting.update({
    where: { id: params.id },
    data: { ...(body.name !== undefined ? { name: body.name } : {}) }
  });

  return { id: account.id, name: account.name, createdAt: account.createdAt };
});

// Admin: delete shared hosting account
app.delete("/admin/shared-hosting/:id", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  await prisma.sharedHosting.delete({ where: { id: params.id } });

  return { ok: true };
});

// Admin: add domain to shared hosting
app.post("/admin/shared-hosting/:id/domains", async (req) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      domain: z.string().min(1)
    })
    .parse(req.body);

  const account = await prisma.sharedHosting.findUnique({ where: { id: params.id } });
  if (!account) throw app.httpErrors.notFound("shared-hosting-not-found");

  // Normalize domain (remove protocol, trailing slashes)
  let normalizedDomain = body.domain.trim().toLowerCase();
  normalizedDomain = normalizedDomain.replace(/^https?:\/\//, "");
  normalizedDomain = normalizedDomain.replace(/\/.*$/, "");

  const domain = await prisma.sharedHostingDomain.create({
    data: {
      sharedHostingId: account.id,
      domain: normalizedDomain
    }
  });

  return {
    id: domain.id,
    domain: domain.domain,
    enabled: domain.enabled,
    createdAt: domain.createdAt
  };
});

// Admin: update domain
app.patch("/admin/shared-hosting/:id/domains/:domainId", async (req) => {
  const params = z
    .object({
      id: z.string().min(1),
      domainId: z.string().min(1)
    })
    .parse(req.params);

  const body = z
    .object({
      domain: z.string().min(1).optional(),
      enabled: z.boolean().optional()
    })
    .parse(req.body);

  const domain = await prisma.sharedHostingDomain.findFirst({
    where: { id: params.domainId, sharedHostingId: params.id }
  });

  if (!domain) throw app.httpErrors.notFound("domain-not-found");

  let normalizedDomain = body.domain;
  if (normalizedDomain) {
    normalizedDomain = normalizedDomain.trim().toLowerCase();
    normalizedDomain = normalizedDomain.replace(/^https?:\/\//, "");
    normalizedDomain = normalizedDomain.replace(/\/.*$/, "");
  }

  const updated = await prisma.sharedHostingDomain.update({
    where: { id: domain.id },
    data: {
      ...(normalizedDomain !== undefined ? { domain: normalizedDomain } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {})
    }
  });

  return {
    id: updated.id,
    domain: updated.domain,
    enabled: updated.enabled,
    createdAt: updated.createdAt
  };
});

// Admin: delete domain
app.delete("/admin/shared-hosting/:id/domains/:domainId", async (req) => {
  const params = z
    .object({
      id: z.string().min(1),
      domainId: z.string().min(1)
    })
    .parse(req.params);

  const domain = await prisma.sharedHostingDomain.findFirst({
    where: { id: params.domainId, sharedHostingId: params.id }
  });

  if (!domain) throw app.httpErrors.notFound("domain-not-found");

  await prisma.sharedHostingDomain.delete({ where: { id: domain.id } });

  return { ok: true };
});

startUptimeScheduler(prisma, env);
startDomainScheduler(prisma, env);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
