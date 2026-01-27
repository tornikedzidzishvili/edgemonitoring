import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/sessionAuth.js";
import { hashPassword, verifyPassword } from "../services/userAuth.js";
import { generateTwoFactorSecret, verifyTwoFactorToken } from "../services/twoFactor.js";

export async function profileRoutes(app: FastifyInstance) {
  // Get user profile
  app.get("/profile", { preHandler: requireAuth }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        position: true,
        phone: true,
        role: true,
        twoFactorEnabled: true,
        createdAt: true
      }
    });

    if (!user) {
      throw new Error("User not found");
    }

    return { user };
  });

  // Update user profile
  app.patch("/profile", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        fullName: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional()
      })
      .parse(req.body);

    // If email is being changed, check if it's already taken
    if (body.email && body.email !== req.user!.email) {
      const existing = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() }
      });

      if (existing) {
        return reply.status(400).send({ 
          error: "email-taken", 
          message: "Email is already in use" 
        });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(body.fullName && { fullName: body.fullName }),
        ...(body.email && { email: body.email.toLowerCase() }),
        ...(body.phone !== undefined && { phone: body.phone || null })
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        position: true,
        phone: true,
        role: true,
        twoFactorEnabled: true
      }
    });

    return { user };
  });

  // Change password
  app.post("/profile/change-password", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8)
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
      return reply.status(404).send({ error: "user-not-found" });
    }

    const isValid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({ 
        error: "invalid-password", 
        message: "Current password is incorrect" 
      });
    }

    const newPasswordHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    });

    return { ok: true };
  });

  // Generate 2FA secret and QR code
  app.post("/profile/2fa/setup", { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
      return reply.status(404).send({ error: "user-not-found" });
    }

    if (user.twoFactorEnabled) {
      return reply.status(400).send({ 
        error: "2fa-already-enabled", 
        message: "Two-factor authentication is already enabled" 
      });
    }

    const { secret, qrCodeUrl } = await generateTwoFactorSecret(user.email);

    // Store the secret temporarily (not enabled yet)
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret }
    });

    return { secret, qrCodeUrl };
  });

  // Enable 2FA (verify token first)
  app.post("/profile/2fa/enable", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        token: z.string().length(6)
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
      return reply.status(404).send({ error: "user-not-found" });
    }

    if (user.twoFactorEnabled) {
      return reply.status(400).send({ 
        error: "2fa-already-enabled", 
        message: "Two-factor authentication is already enabled" 
      });
    }

    if (!user.twoFactorSecret) {
      return reply.status(400).send({ 
        error: "2fa-not-setup", 
        message: "Two-factor authentication setup required first" 
      });
    }

    const isValid = verifyTwoFactorToken(body.token, user.twoFactorSecret);
    if (!isValid) {
      return reply.status(401).send({ 
        error: "invalid-token", 
        message: "Invalid verification token" 
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true }
    });

    return { ok: true };
  });

  // Disable 2FA
  app.post("/profile/2fa/disable", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        password: z.string().min(1),
        token: z.string().length(6)
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
      return reply.status(404).send({ error: "user-not-found" });
    }

    if (!user.twoFactorEnabled) {
      return reply.status(400).send({ 
        error: "2fa-not-enabled", 
        message: "Two-factor authentication is not enabled" 
      });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(body.password, user.passwordHash);
    if (!isPasswordValid) {
      return reply.status(401).send({ 
        error: "invalid-password", 
        message: "Invalid password" 
      });
    }

    // Verify 2FA token
    if (!user.twoFactorSecret) {
      return reply.status(400).send({ error: "2fa-secret-missing" });
    }

    const isTokenValid = verifyTwoFactorToken(body.token, user.twoFactorSecret);
    if (!isTokenValid) {
      return reply.status(401).send({ 
        error: "invalid-token", 
        message: "Invalid verification token" 
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        twoFactorEnabled: false,
        twoFactorSecret: null
      }
    });

    return { ok: true };
  });
}
