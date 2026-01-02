import type { FastifyRequest } from "fastify";
import { hashApiKey, safeEqual } from "./security.js";

export function requireAdmin(req: FastifyRequest, adminApiKey: string): void {
  const provided = req.headers["x-admin-key"];
  if (typeof provided !== "string") {
    throw new Error("missing-admin-key");
  }
  if (!safeEqual(provided, adminApiKey)) {
    throw new Error("invalid-admin-key");
  }
}

export function getAgentKeyHash(req: FastifyRequest): string {
  const provided = req.headers["x-agent-key"];
  if (typeof provided !== "string" || provided.length < 10) {
    throw new Error("missing-agent-key");
  }
  return hashApiKey(provided);
}
