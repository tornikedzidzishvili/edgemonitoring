import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { encryptString, decryptString } from "../cryptoBox.js";
import { getEnv } from "../env.js";
import { requireAdmin } from "../middleware/sessionAuth.js";
import {
  testPleskConnection,
  syncPleskDomains,
  fetchAvailablePleskDomains
} from "../services/plesk.js";

export async function sharedHostingServerRoutes(app: FastifyInstance) {
  const env = getEnv();

  // ============ SHARED HOSTING SERVER MANAGEMENT ============

  // List all shared hosting servers (admin only)
  app.get("/settings/shared-hosting/servers", { preHandler: requireAdmin }, async () => {
    const servers = await prisma.sharedHostingServer.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { accounts: true }
        }
      }
    });

    return {
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        apiUrl: s.apiUrl,
        hasApiKey: !!(s.apiKeyEnc),
        hasCredentials: !!(s.usernameEnc && s.passwordEnc),
        syncAll: s.syncAll,
        lastSyncAt: s.lastSyncAt,
        lastSyncError: s.lastSyncError,
        enabled: s.enabled,
        accountsCount: s._count.accounts,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    };
  });

  // Get single shared hosting server (admin only)
  app.get("/settings/shared-hosting/servers/:id", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const server = await prisma.sharedHostingServer.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: { accounts: true }
        },
        accounts: {
          include: {
            _count: {
              select: { domains: true }
            }
          },
          orderBy: { name: "asc" }
        }
      }
    });

    if (!server) throw app.httpErrors.notFound("server-not-found");

    return {
      server: {
        id: server.id,
        name: server.name,
        type: server.type,
        apiUrl: server.apiUrl,
        hasApiKey: !!(server.apiKeyEnc),
        hasCredentials: !!(server.usernameEnc && server.passwordEnc),
        syncAll: server.syncAll,
        lastSyncAt: server.lastSyncAt,
        lastSyncError: server.lastSyncError,
        enabled: server.enabled,
        accountsCount: server._count.accounts,
        accounts: server.accounts.map(a => ({
          id: a.id,
          name: a.name,
          pleskCustomerId: a.pleskCustomerId,
          pleskLogin: a.pleskLogin,
          domainsCount: a._count.domains
        })),
        createdAt: server.createdAt,
        updatedAt: server.updatedAt
      }
    };
  });

  // Create shared hosting server (admin only)
  app.post("/settings/shared-hosting/servers", { preHandler: requireAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        type: z.enum(["plesk", "manual"]).default("plesk"),
        apiUrl: z.string().min(1).optional(), // Will be normalized by plesk service
        apiKey: z.string().min(1).optional(),
        username: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
        syncAll: z.boolean().default(true),
        enabled: z.boolean().default(true)
      })
      .parse(req.body);

    const data: any = {
      name: body.name,
      type: body.type,
      apiUrl: body.apiUrl ?? null,
      syncAll: body.syncAll,
      enabled: body.enabled
    };

    // Encrypt API key if provided
    if (body.apiKey) {
      const box = encryptString(body.apiKey, env.SSH_KEY_MASTER_SECRET);
      data.apiKeyEnc = box.enc;
      data.apiKeyIv = box.iv;
      data.apiKeyTag = box.tag;
    }

    // Encrypt username if provided
    if (body.username) {
      const box = encryptString(body.username, env.SSH_KEY_MASTER_SECRET);
      data.usernameEnc = box.enc;
      data.usernameIv = box.iv;
      data.usernameTag = box.tag;
    }

    // Encrypt password if provided
    if (body.password) {
      const box = encryptString(body.password, env.SSH_KEY_MASTER_SECRET);
      data.passwordEnc = box.enc;
      data.passwordIv = box.iv;
      data.passwordTag = box.tag;
    }

    const server = await prisma.sharedHostingServer.create({ data });

    return {
      server: {
        id: server.id,
        name: server.name,
        type: server.type,
        apiUrl: server.apiUrl,
        hasApiKey: !!(server.apiKeyEnc),
        hasCredentials: !!(server.usernameEnc && server.passwordEnc),
        syncAll: server.syncAll,
        enabled: server.enabled,
        createdAt: server.createdAt
      }
    };
  });

  // Update shared hosting server (admin only)
  app.patch("/settings/shared-hosting/servers/:id", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        type: z.enum(["plesk", "manual"]).optional(),
        apiUrl: z.string().min(1).nullable().optional(), // Will be normalized by plesk service
        apiKey: z.string().min(1).nullable().optional(),
        username: z.string().min(1).nullable().optional(),
        password: z.string().min(1).nullable().optional(),
        syncAll: z.boolean().optional(),
        enabled: z.boolean().optional()
      })
      .parse(req.body);

    const existing = await prisma.sharedHostingServer.findUnique({ where: { id: params.id } });
    if (!existing) throw app.httpErrors.notFound("server-not-found");

    const data: any = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.type !== undefined) data.type = body.type;
    if (body.apiUrl !== undefined) data.apiUrl = body.apiUrl;
    if (body.syncAll !== undefined) data.syncAll = body.syncAll;
    if (body.enabled !== undefined) data.enabled = body.enabled;

    // Handle API key
    if (body.apiKey === null) {
      data.apiKeyEnc = null;
      data.apiKeyIv = null;
      data.apiKeyTag = null;
    } else if (body.apiKey) {
      const box = encryptString(body.apiKey, env.SSH_KEY_MASTER_SECRET);
      data.apiKeyEnc = box.enc;
      data.apiKeyIv = box.iv;
      data.apiKeyTag = box.tag;
    }

    // Handle username
    if (body.username === null) {
      data.usernameEnc = null;
      data.usernameIv = null;
      data.usernameTag = null;
    } else if (body.username) {
      const box = encryptString(body.username, env.SSH_KEY_MASTER_SECRET);
      data.usernameEnc = box.enc;
      data.usernameIv = box.iv;
      data.usernameTag = box.tag;
    }

    // Handle password
    if (body.password === null) {
      data.passwordEnc = null;
      data.passwordIv = null;
      data.passwordTag = null;
    } else if (body.password) {
      const box = encryptString(body.password, env.SSH_KEY_MASTER_SECRET);
      data.passwordEnc = box.enc;
      data.passwordIv = box.iv;
      data.passwordTag = box.tag;
    }

    const server = await prisma.sharedHostingServer.update({
      where: { id: params.id },
      data
    });

    return {
      server: {
        id: server.id,
        name: server.name,
        type: server.type,
        apiUrl: server.apiUrl,
        hasApiKey: !!(server.apiKeyEnc),
        hasCredentials: !!(server.usernameEnc && server.passwordEnc),
        syncAll: server.syncAll,
        enabled: server.enabled,
        updatedAt: server.updatedAt
      }
    };
  });

  // Delete shared hosting server (admin only)
  app.delete("/settings/shared-hosting/servers/:id", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const existing = await prisma.sharedHostingServer.findUnique({ where: { id: params.id } });
    if (!existing) throw app.httpErrors.notFound("server-not-found");

    await prisma.sharedHostingServer.delete({ where: { id: params.id } });

    return { ok: true };
  });

  // Test connection to shared hosting server (admin only)
  app.post("/settings/shared-hosting/servers/:id/test", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const server = await prisma.sharedHostingServer.findUnique({ where: { id: params.id } });
    if (!server) throw app.httpErrors.notFound("server-not-found");

    if (server.type !== "plesk") {
      return { ok: true, message: "Connection test not available for manual servers" };
    }

    if (!server.apiUrl) {
      throw app.httpErrors.badRequest("missing-api-url");
    }

    // Decrypt credentials
    let apiKey: string | undefined;
    let username: string | undefined;
    let password: string | undefined;

    if (server.apiKeyEnc && server.apiKeyIv && server.apiKeyTag) {
      apiKey = decryptString(
        { enc: server.apiKeyEnc, iv: server.apiKeyIv, tag: server.apiKeyTag },
        env.SSH_KEY_MASTER_SECRET
      );
    }
    if (server.usernameEnc && server.usernameIv && server.usernameTag) {
      username = decryptString(
        { enc: server.usernameEnc, iv: server.usernameIv, tag: server.usernameTag },
        env.SSH_KEY_MASTER_SECRET
      );
    }
    if (server.passwordEnc && server.passwordIv && server.passwordTag) {
      password = decryptString(
        { enc: server.passwordEnc, iv: server.passwordIv, tag: server.passwordTag },
        env.SSH_KEY_MASTER_SECRET
      );
    }

    const result = await testPleskConnection({
      apiUrl: server.apiUrl,
      apiKey,
      username,
      password
    });

    // Log connection attempt for debugging
    console.log(`[Plesk Test] Server: ${server.apiUrl}, hasApiKey: ${!!apiKey}, hasUsername: ${!!username}, result: ${result.ok ? 'success' : result.message}`);

    return result;
  });

  // Test connection with inline credentials (for testing before saving)
  app.post("/settings/shared-hosting/test-connection", { preHandler: requireAdmin }, async (req) => {
    const body = z
      .object({
        apiUrl: z.string().min(1),
        apiKey: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional()
      })
      .parse(req.body);

    if (!body.apiKey && (!body.username || !body.password)) {
      return { ok: false, message: "Either API key or username/password required" };
    }

    console.log(`[Plesk Test Inline] URL: ${body.apiUrl}, hasApiKey: ${!!body.apiKey}, username: ${body.username || 'none'}`);

    const result = await testPleskConnection({
      apiUrl: body.apiUrl,
      apiKey: body.apiKey,
      username: body.username,
      password: body.password
    });

    console.log(`[Plesk Test Inline] Result: ${result.ok ? 'success' : result.message}`);

    return result;
  });

  // Sync domains from shared hosting server (admin only)
  app.post("/settings/shared-hosting/servers/:id/sync", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z
      .object({
        selectedDomains: z.array(z.string()).optional()
      })
      .parse(req.body);

    const server = await prisma.sharedHostingServer.findUnique({ where: { id: params.id } });
    if (!server) throw app.httpErrors.notFound("server-not-found");

    if (server.type !== "plesk") {
      throw app.httpErrors.badRequest("sync-not-available-for-manual-servers");
    }

    const result = await syncPleskDomains(params.id, body.selectedDomains);

    return result;
  });

  // Get available domains from shared hosting server (for selection UI)
  app.get("/settings/shared-hosting/servers/:id/domains", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const server = await prisma.sharedHostingServer.findUnique({ where: { id: params.id } });
    if (!server) throw app.httpErrors.notFound("server-not-found");

    if (server.type !== "plesk") {
      return { success: false, domains: [], error: "Not a Plesk server" };
    }

    const result = await fetchAvailablePleskDomains(params.id);

    return result;
  });

  // Get synced domains for a server (admin only)
  app.get("/settings/shared-hosting/servers/:id/synced-domains", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const server = await prisma.sharedHostingServer.findUnique({
      where: { id: params.id },
      include: {
        accounts: {
          include: {
            domains: {
              select: {
                id: true,
                domain: true,
                customerName: true,
                customerEmail: true,
                enabled: true,
                createdAt: true
              }
            }
          }
        }
      }
    });

    if (!server) throw app.httpErrors.notFound("server-not-found");

    const domains = server.accounts.flatMap(a =>
      a.domains.map(d => ({
        ...d,
        accountId: a.id,
        accountName: a.name
      }))
    );

    return { domains };
  });

  // Toggle monitoring for specific domains (admin only)
  app.post("/settings/shared-hosting/servers/:id/toggle-domains", { preHandler: requireAdmin }, async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z
      .object({
        domainIds: z.array(z.string()),
        enabled: z.boolean()
      })
      .parse(req.body);

    await prisma.sharedHostingDomain.updateMany({
      where: {
        id: { in: body.domainIds },
        sharedHosting: {
          serverId: params.id
        }
      },
      data: { enabled: body.enabled }
    });

    return { ok: true, updatedCount: body.domainIds.length };
  });
}
