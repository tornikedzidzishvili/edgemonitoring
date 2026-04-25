import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { encryptString } from "../cryptoBox.js";
import { getEnv } from "../env.js";
import { requireAdmin } from "../middleware/sessionAuth.js";

// Routes: GET /settings/agent-install
//         PATCH /settings/agent-install
//
// `/settings/*` is classified as authenticated (any user) by routeGuard.ts,
// so each route below adds an explicit `preHandler: requireAdmin` to enforce
// admin-only access. This matches the project pattern used by settings.ts,
// serverAlerts.ts, and sharedHostingServers.ts.
//
// The registry token is NEVER returned by GET, NEVER logged, NEVER sent to the
// client in any form. Only the `configured` boolean signals its presence.

export async function agentInstallSettingsRoutes(app: FastifyInstance) {
  const env = getEnv();

  // GET /settings/agent-install
  // Returns configured status, username, and registryUrl.
  // Token is deliberately absent from the response shape.
  app.get("/settings/agent-install", { preHandler: requireAdmin }, async () => {
    const settings = await prisma.agentInstallSettings.findFirst();

    const configured = !!(settings?.username && settings?.tokenEnc);

    return {
      configured,
      username: settings?.username ?? null,
      registryUrl: settings?.registryUrl ?? "ghcr.io"
    };
  });

  // PATCH /settings/agent-install
  // All fields optional. null clears; undefined leaves unchanged.
  // Token is encrypted via AES-256-GCM before storage.
  app.patch("/settings/agent-install", { preHandler: requireAdmin }, async (req) => {
    const body = z
      .object({
        username: z.string().min(1).nullable().optional(),
        token: z.string().min(1).nullable().optional(),
        registryUrl: z.string().min(1).optional()
      })
      .parse(req.body);

    const existing = await prisma.agentInstallSettings.findFirst();

    // Build the data object incrementally — only touch fields that were
    // explicitly provided so unrelated fields remain unchanged on partial
    // updates.
    const data: Record<string, unknown> = {};

    if (body.registryUrl !== undefined) {
      data.registryUrl = body.registryUrl;
    }

    if (body.username !== undefined) {
      data.username = body.username; // null clears, string sets
    }

    if (body.token === null) {
      // Explicit null — clear the token triple
      data.tokenEnc = null;
      data.tokenIv = null;
      data.tokenTag = null;
    } else if (typeof body.token === "string") {
      // New token provided — encrypt and store
      const box = encryptString(body.token, env.SSH_KEY_MASTER_SECRET);
      data.tokenEnc = box.enc;
      data.tokenIv = box.iv;
      data.tokenTag = box.tag;
    }
    // If body.token === undefined: leave existing token triple untouched

    let saved;
    if (existing) {
      saved = await prisma.agentInstallSettings.update({
        where: { id: existing.id },
        data
      });
    } else {
      // No row yet — create with sensible defaults merged with provided fields
      saved = await prisma.agentInstallSettings.create({
        data: {
          registryUrl: (data.registryUrl as string | undefined) ?? "ghcr.io",
          username: (data.username as string | null | undefined) ?? null,
          tokenEnc: (data.tokenEnc as string | null | undefined) ?? null,
          tokenIv: (data.tokenIv as string | null | undefined) ?? null,
          tokenTag: (data.tokenTag as string | null | undefined) ?? null
        }
      });
    }

    const configured = !!(saved.username && saved.tokenEnc);

    // Return the same shape as GET — token never included
    return {
      configured,
      username: saved.username ?? null,
      registryUrl: saved.registryUrl
    };
  });
}
