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
        sshHost: s.sshHost,
        hasApiKey: !!(s.apiKeyEnc),
        hasCredentials: !!(s.usernameEnc && s.passwordEnc),
        sshKeyId: s.sshKeyId,
        sshUser: s.sshUser,
        sshPort: s.sshPort,
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
        sshHost: server.sshHost,
        hasApiKey: !!(server.apiKeyEnc),
        hasCredentials: !!(server.usernameEnc && server.passwordEnc),
        sshKeyId: server.sshKeyId,
        sshUser: server.sshUser,
        sshPort: server.sshPort,
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
  app.post("/settings/shared-hosting/servers", { preHandler: requireAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        type: z.enum(["plesk", "manual", "cyberpanel"]).default("plesk"),
        apiUrl: z.string().min(1).optional(), // Will be normalized by plesk service
        apiKey: z.string().min(1).optional(),
        username: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
        // SSH fields — valid for all types; required when type is "cyberpanel"
        sshKeyId: z.string().min(1).nullable().optional(),
        sshUser: z.string().min(1).optional(),
        sshPort: z.number().int().min(1).max(65535).optional(),
        // EMS-31: dedicated SSH host/IP for CyberPanel rows; required when type is "cyberpanel"
        sshHost: z.string().min(1).max(253).nullable().optional(),
        syncAll: z.boolean().default(true),
        enabled: z.boolean().default(true)
      })
      .parse(req.body);

    // EMS-24: CyberPanel requires a valid SSH key reference. Validate here so
    // the caller gets HTTP 400 (not 500) on any FK or missing-field problem.
    if (body.type === "cyberpanel") {
      if (!body.sshKeyId) {
        return reply.status(400).send({
          error: "sshKeyId is required and must reference an existing SSH key when type is 'cyberpanel'"
        });
      }
      const keyExists = await prisma.sshKey.findUnique({ where: { id: body.sshKeyId }, select: { id: true } });
      if (!keyExists) {
        return reply.status(400).send({
          error: "sshKeyId is required and must reference an existing SSH key when type is 'cyberpanel'"
        });
      }
      // EMS-31: sshHost is the canonical host/IP for CyberPanel SSH connections.
      if (!body.sshHost) {
        return reply.status(400).send({
          error: "sshHost is required when type is 'cyberpanel'"
        });
      }
      // Apply defaults for optional SSH fields when type is cyberpanel
      if (body.sshUser === undefined) body.sshUser = "root";
      if (body.sshPort === undefined) body.sshPort = 22;
    }

    const data: {
      name: string;
      type: string;
      apiUrl: string | null;
      syncAll: boolean;
      enabled: boolean;
      sshKeyId?: string | null;
      sshUser?: string;
      sshPort?: number;
      sshHost?: string | null;
      apiKeyEnc?: string;
      apiKeyIv?: string;
      apiKeyTag?: string;
      usernameEnc?: string;
      usernameIv?: string;
      usernameTag?: string;
      passwordEnc?: string;
      passwordIv?: string;
      passwordTag?: string;
    } = {
      name: body.name,
      type: body.type,
      apiUrl: body.apiUrl ?? null,
      syncAll: body.syncAll,
      enabled: body.enabled
    };

    // Write SSH fields when provided (accepted for all types; required path
    // for cyberpanel already validated above)
    if (body.sshKeyId !== undefined) data.sshKeyId = body.sshKeyId;
    if (body.sshUser !== undefined) data.sshUser = body.sshUser;
    if (body.sshPort !== undefined) data.sshPort = body.sshPort;
    if (body.sshHost !== undefined) data.sshHost = body.sshHost;

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
        sshHost: server.sshHost,
        hasApiKey: !!(server.apiKeyEnc),
        hasCredentials: !!(server.usernameEnc && server.passwordEnc),
        sshKeyId: server.sshKeyId,
        sshUser: server.sshUser,
        sshPort: server.sshPort,
        syncAll: server.syncAll,
        enabled: server.enabled,
        createdAt: server.createdAt
      }
    };
  });

  // Update shared hosting server (admin only)
  app.patch("/settings/shared-hosting/servers/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        type: z.enum(["plesk", "manual", "cyberpanel"]).optional(),
        apiUrl: z.string().min(1).nullable().optional(), // Will be normalized by plesk service
        apiKey: z.string().min(1).nullable().optional(),
        username: z.string().min(1).nullable().optional(),
        password: z.string().min(1).nullable().optional(),
        // SSH fields — valid for all types; required when resolved type is "cyberpanel"
        sshKeyId: z.string().min(1).nullable().optional(),
        sshUser: z.string().min(1).optional(),
        sshPort: z.number().int().min(1).max(65535).optional(),
        // EMS-31: dedicated SSH host/IP for CyberPanel rows; required when resolved type is "cyberpanel"
        sshHost: z.string().min(1).max(253).nullable().optional(),
        syncAll: z.boolean().optional(),
        enabled: z.boolean().optional()
      })
      .parse(req.body);

    const existing = await prisma.sharedHostingServer.findUnique({ where: { id: params.id } });
    if (!existing) throw app.httpErrors.notFound("server-not-found");

    // EMS-24: resolve the effective type — body wins, fall back to stored value.
    // This lets us validate cyberpanel requirements even when only fields other
    // than `type` are being changed on an already-cyberpanel server.
    const resolvedType = body.type ?? existing.type;

    if (resolvedType === "cyberpanel") {
      // Resolve the effective sshKeyId: body wins, fall back to stored value.
      const resolvedSshKeyId = body.sshKeyId !== undefined ? body.sshKeyId : existing.sshKeyId;

      if (!resolvedSshKeyId) {
        return reply.status(400).send({
          error: "sshKeyId is required and must reference an existing SSH key when type is 'cyberpanel'"
        });
      }
      const keyExists = await prisma.sshKey.findUnique({ where: { id: resolvedSshKeyId }, select: { id: true } });
      if (!keyExists) {
        return reply.status(400).send({
          error: "sshKeyId is required and must reference an existing SSH key when type is 'cyberpanel'"
        });
      }

      // EMS-31: resolve the effective sshHost — body wins, fall back to stored value.
      const resolvedSshHost = body.sshHost !== undefined ? body.sshHost : existing.sshHost;
      if (!resolvedSshHost) {
        return reply.status(400).send({
          error: "sshHost is required when type is 'cyberpanel'"
        });
      }
    }

    const data: {
      name?: string;
      type?: string;
      apiUrl?: string | null;
      syncAll?: boolean;
      enabled?: boolean;
      sshKeyId?: string | null;
      sshUser?: string;
      sshPort?: number;
      sshHost?: string | null;
      apiKeyEnc?: string | null;
      apiKeyIv?: string | null;
      apiKeyTag?: string | null;
      usernameEnc?: string | null;
      usernameIv?: string | null;
      usernameTag?: string | null;
      passwordEnc?: string | null;
      passwordIv?: string | null;
      passwordTag?: string | null;
    } = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.type !== undefined) data.type = body.type;
    if (body.apiUrl !== undefined) data.apiUrl = body.apiUrl;
    if (body.syncAll !== undefined) data.syncAll = body.syncAll;
    if (body.enabled !== undefined) data.enabled = body.enabled;

    // SSH fields: write whatever was explicitly sent (null clears, string sets)
    if (body.sshKeyId !== undefined) data.sshKeyId = body.sshKeyId;
    if (body.sshUser !== undefined) data.sshUser = body.sshUser;
    if (body.sshPort !== undefined) data.sshPort = body.sshPort;
    if (body.sshHost !== undefined) data.sshHost = body.sshHost;

    // When switching TO cyberpanel and the caller hasn't supplied sshUser/sshPort,
    // apply defaults only if the stored values are also absent.
    if (body.type === "cyberpanel") {
      if (data.sshUser === undefined && !existing.sshUser) data.sshUser = "root";
      if (data.sshPort === undefined && !existing.sshPort) data.sshPort = 22;
    }

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
        sshHost: server.sshHost,
        hasApiKey: !!(server.apiKeyEnc),
        hasCredentials: !!(server.usernameEnc && server.passwordEnc),
        sshKeyId: server.sshKeyId,
        sshUser: server.sshUser,
        sshPort: server.sshPort,
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
