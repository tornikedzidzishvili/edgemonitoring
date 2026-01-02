import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, deleteUserSessions } from "../services/userAuth.js";
import { requireAdmin } from "../middleware/sessionAuth.js";

export async function usersRoutes(app: FastifyInstance) {
  // List all users (admin only)
  app.get("/users", { preHandler: requireAdmin }, async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        fullName: true,
        position: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return { users };
  });

  // Get single user (admin only)
  app.get("/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        position: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return reply.status(404).send({ error: "user-not-found" });
    }

    return { user };
  });

  // Create user (admin only)
  app.post("/users", { preHandler: requireAdmin }, async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        fullName: z.string().min(1),
        position: z.string().optional(),
        role: z.enum(["admin", "user"]).default("user")
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() }
    });

    if (existing) {
      return reply.status(400).send({ error: "email-exists", message: "A user with this email already exists" });
    }

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        fullName: body.fullName,
        position: body.position ?? null,
        role: body.role
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        position: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return { user };
  });

  // Update user (admin only)
  app.patch("/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z
      .object({
        email: z.string().email().optional(),
        fullName: z.string().min(1).optional(),
        position: z.string().nullable().optional(),
        role: z.enum(["admin", "user"]).optional(),
        password: z.string().min(8).optional()
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id: params.id } });
    if (!existing) {
      return reply.status(404).send({ error: "user-not-found" });
    }

    // Check email uniqueness if changing email
    if (body.email && body.email.toLowerCase() !== existing.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() }
      });
      if (emailExists) {
        return reply.status(400).send({ error: "email-exists", message: "A user with this email already exists" });
      }
    }

    const data: Record<string, unknown> = {};
    if (body.email !== undefined) data.email = body.email.toLowerCase();
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.position !== undefined) data.position = body.position;
    if (body.role !== undefined) data.role = body.role;
    if (body.password !== undefined) data.passwordHash = await hashPassword(body.password);

    const user = await prisma.user.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        position: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return { user };
  });

  // Delete user (admin only)
  app.delete("/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);

    const existing = await prisma.user.findUnique({ where: { id: params.id } });
    if (!existing) {
      return reply.status(404).send({ error: "user-not-found" });
    }

    // Prevent deleting yourself
    if (existing.id === req.user!.id) {
      return reply.status(400).send({ error: "cannot-delete-self", message: "You cannot delete your own account" });
    }

    // Prevent deleting the last admin
    if (existing.role === "admin") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return reply.status(400).send({ error: "cannot-delete-last-admin", message: "Cannot delete the last admin user" });
      }
    }

    // Delete user sessions first
    await deleteUserSessions(params.id);

    await prisma.user.delete({ where: { id: params.id } });

    return { ok: true };
  });
}
