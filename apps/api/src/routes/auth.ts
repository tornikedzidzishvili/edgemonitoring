import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword, createSession, deleteSession } from "../services/userAuth.js";
import { requireAuth } from "../middleware/sessionAuth.js";
import { generateTwoFactorSecret, verifyTwoFactorToken } from "../services/twoFactor.js";

export async function authRoutes(app: FastifyInstance) {
  // Check if setup is needed (no users exist)
  app.get("/auth/setup-required", async () => {
    const userCount = await prisma.user.count();
    return { setupRequired: userCount === 0 };
  });

  // Initial setup - create first admin user (only works if no users exist)
  app.post("/auth/setup", async (req, reply) => {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return reply.status(400).send({ error: "setup-already-complete", message: "Setup has already been completed" });
    }

    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        fullName: z.string().min(1),
        position: z.string().optional()
      })
      .parse(req.body);

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        fullName: body.fullName,
        position: body.position ?? null,
        role: "admin" // First user is always admin
      }
    });

    const { token } = await createSession(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        position: user.position,
        phone: user.phone,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled
      },
      token
    };
  });

  // Login
  app.post("/auth/login", async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
        twoFactorToken: z.string().optional()
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() }
    });

    if (!user) {
      return reply.status(401).send({ error: "invalid-credentials", message: "Invalid email or password" });
    }

    const isValid = await verifyPassword(body.password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({ error: "invalid-credentials", message: "Invalid email or password" });
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!body.twoFactorToken) {
        return reply.status(401).send({ 
          error: "2fa-required", 
          message: "Two-factor authentication token required" 
        });
      }

      const isTokenValid = verifyTwoFactorToken(body.twoFactorToken, user.twoFactorSecret);
      if (!isTokenValid) {
        return reply.status(401).send({ 
          error: "invalid-2fa-token", 
          message: "Invalid two-factor authentication token" 
        });
      }
    }

    const { token } = await createSession(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        position: user.position,
        phone: user.phone,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled
      },
      token
    };
  });

  // Logout
  app.post("/auth/logout", { preHandler: requireAuth }, async (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      await deleteSession(token);
    }
    return { ok: true };
  });

  // Get current user
  app.get("/auth/me", { preHandler: requireAuth }, async (req) => {
    return { 
      user: {
        ...req.user,
        twoFactorEnabled: req.user?.twoFactorEnabled ?? false
      }
    };
  });

  // Change password
  app.post("/auth/change-password", { preHandler: requireAuth }, async (req, reply) => {
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
      return reply.status(401).send({ error: "invalid-password", message: "Current password is incorrect" });
    }

    const newPasswordHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    });

    return { ok: true };
  });
}
