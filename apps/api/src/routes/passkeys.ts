import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/sessionAuth.js";
import {
  generatePasskeyRegistrationOptions,
  generatePasskeyAuthenticationOptions,
  verifyPasskeyRegistration,
  verifyPasskeyAuthentication,
  serializeTransports,
  deserializeTransports
} from "../services/passkey.js";
import { createSession } from "../services/userAuth.js";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON
} from "@simplewebauthn/server";

// Temporary storage for challenges (in production, use Redis or similar)
const challenges = new Map<string, { challenge: string; expiresAt: number }>();

// Clean up expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of challenges.entries()) {
    if (value.expiresAt < now) {
      challenges.delete(key);
    }
  }
}, 5 * 60 * 1000);

export async function passkeyRoutes(app: FastifyInstance) {
  // Generate registration options (authenticated users adding a passkey)
  app.post("/passkeys/register/options", { preHandler: requireAuth }, async (req) => {
    const user = req.user!;

    // Get existing passkeys to exclude them
    const existingPasskeys = await prisma.passkey.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true }
    });

    const options = await generatePasskeyRegistrationOptions({
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      existingCredentials: existingPasskeys.map((pk) => ({
        id: pk.credentialId,
        transports: deserializeTransports(pk.transports)
      }))
    });

    // Store challenge
    challenges.set(`reg-${user.id}`, {
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    });

    return options;
  });

  // Verify registration and save passkey
  app.post("/passkeys/register/verify", { preHandler: requireAuth }, async (req, reply) => {
    const user = req.user!;

    const body = z
      .object({
        response: z.any() as z.ZodType<RegistrationResponseJSON>,
        name: z.string().min(1).max(50).optional()
      })
      .parse(req.body);

    const challengeData = challenges.get(`reg-${user.id}`);
    if (!challengeData) {
      return reply.status(400).send({
        error: "invalid-challenge",
        message: "Challenge not found or expired"
      });
    }

    challenges.delete(`reg-${user.id}`);

    try {
      const verification = await verifyPasskeyRegistration(
        body.response,
        challengeData.challenge
      );

      if (!verification.verified || !verification.registrationInfo) {
        return reply.status(400).send({
          error: "verification-failed",
          message: "Passkey verification failed"
        });
      }

      const { credential } = verification.registrationInfo;

      // Save passkey to database
      const passkey = await prisma.passkey.create({
        data: {
          userId: user.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString("base64"),
          counter: credential.counter,
          transports: serializeTransports(body.response.response.transports),
          name: body.name || `Passkey ${new Date().toLocaleDateString()}`
        }
      });

      return {
        id: passkey.id,
        name: passkey.name,
        createdAt: passkey.createdAt
      };
    } catch (error) {
      return reply.status(400).send({
        error: "registration-failed",
        message: error instanceof Error ? error.message : "Failed to register passkey"
      });
    }
  });

  // Generate authentication options (for login)
  app.post("/passkeys/authenticate/options", async (req) => {
    const body = z
      .object({
        email: z.string().email().optional()
      })
      .parse(req.body);

    let allowCredentials;

    // If email provided, only allow passkeys for that user
    if (body.email) {
      const user = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
        include: {
          passkeys: {
            select: { credentialId: true, transports: true }
          }
        }
      });

      if (user && user.passkeys.length > 0) {
        allowCredentials = user.passkeys.map((pk) => ({
          id: pk.credentialId,
          transports: deserializeTransports(pk.transports)
        }));
      }
    }

    const options = await generatePasskeyAuthenticationOptions({
      allowCredentials
    });

    // Store challenge with a temporary ID
    const challengeId = `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    challenges.set(challengeId, {
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    return {
      ...options,
      challengeId
    };
  });

  // Verify authentication and login
  app.post("/passkeys/authenticate/verify", async (req, reply) => {
    const body = z
      .object({
        response: z.any() as z.ZodType<AuthenticationResponseJSON>,
        challengeId: z.string()
      })
      .parse(req.body);

    const challengeData = challenges.get(body.challengeId);
    if (!challengeData) {
      return reply.status(400).send({
        error: "invalid-challenge",
        message: "Challenge not found or expired"
      });
    }

    challenges.delete(body.challengeId);

    // Find passkey by credential ID
    const credentialId = body.response.id;
    const passkey = await prisma.passkey.findUnique({
      where: { credentialId },
      include: { user: true }
    });

    if (!passkey) {
      return reply.status(400).send({
        error: "passkey-not-found",
        message: "Passkey not found"
      });
    }

    try {
      const verification = await verifyPasskeyAuthentication(
        body.response,
        challengeData.challenge,
        Buffer.from(passkey.publicKey, "base64"),
        passkey.counter
      );

      if (!verification.verified) {
        return reply.status(400).send({
          error: "verification-failed",
          message: "Passkey verification failed"
        });
      }

      // Update counter and last used timestamp
      await prisma.passkey.update({
        where: { id: passkey.id },
        data: {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date()
        }
      });

      // Create session
      const { token } = await createSession(passkey.userId);

      return {
        user: {
          id: passkey.user.id,
          email: passkey.user.email,
          fullName: passkey.user.fullName,
          position: passkey.user.position,
          role: passkey.user.role,
          twoFactorEnabled: passkey.user.twoFactorEnabled
        },
        token
      };
    } catch (error) {
      return reply.status(400).send({
        error: "authentication-failed",
        message: error instanceof Error ? error.message : "Failed to authenticate with passkey"
      });
    }
  });

  // List user's passkeys
  app.get("/passkeys", { preHandler: requireAuth }, async (req) => {
    const passkeys = await prisma.passkey.findMany({
      where: { userId: req.user!.id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    return { passkeys };
  });

  // Delete a passkey
  app.delete("/passkeys/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const passkey = await prisma.passkey.findUnique({
      where: { id }
    });

    if (!passkey) {
      return reply.status(404).send({ error: "passkey-not-found" });
    }

    if (passkey.userId !== req.user!.id) {
      return reply.status(403).send({ error: "forbidden" });
    }

    await prisma.passkey.delete({ where: { id } });

    return { ok: true };
  });

  // Rename a passkey
  app.patch("/passkeys/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ name: z.string().min(1).max(50) }).parse(req.body);

    const passkey = await prisma.passkey.findUnique({
      where: { id }
    });

    if (!passkey) {
      return reply.status(404).send({ error: "passkey-not-found" });
    }

    if (passkey.userId !== req.user!.id) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const updated = await prisma.passkey.update({
      where: { id },
      data: { name: body.name },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true }
    });

    return updated;
  });
}
