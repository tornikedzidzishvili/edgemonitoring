import type { FastifyRequest, FastifyReply } from "fastify";
import { validateSession } from "../services/userAuth.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  position: string | null;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "unauthorized", message: "Missing or invalid authorization header" });
  }

  const token = authHeader.slice(7);
  const session = await validateSession(token);

  if (!session) {
    return reply.status(401).send({ error: "unauthorized", message: "Invalid or expired session" });
  }

  req.user = {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    position: session.user.position,
    role: session.user.role
  };
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return;

  if (req.user?.role !== "admin") {
    return reply.status(403).send({ error: "forbidden", message: "Admin access required" });
  }
}

export async function optionalAuth(req: FastifyRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return;
  }

  const token = authHeader.slice(7);
  const session = await validateSession(token);

  if (session) {
    req.user = {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      position: session.user.position,
      role: session.user.role
    };
  }
}
