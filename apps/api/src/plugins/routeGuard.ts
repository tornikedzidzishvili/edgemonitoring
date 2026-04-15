/**
 * routeGuard plugin
 *
 * Enforces authentication and authorization at the route level using an
 * onRequest hook. All data arriving from monitored servers is treated as
 * untrusted input, so even "internal" paths go through the same checks.
 *
 * Security model:
 *  - Admin routes  → requireAdmin  (valid session + role === "admin")
 *  - Auth routes   → requireAuth   (valid session, any role)
 *  - Public routes → no session check (some have their own key-based auth)
 *  - Unknown paths → deny by default (fail-closed)
 *
 * Import from sessionAuth, NOT from auth.ts (which uses the legacy x-admin-key
 * header and is not suitable for user-session-based access control).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth, requireAdmin } from "../middleware/sessionAuth.js";

// ---------------------------------------------------------------------------
// Route classification helpers
// ---------------------------------------------------------------------------

/**
 * Returns true for any path that must only be accessible to admins.
 * Covers all methods on /admin/* because the HTTP method alone is not
 * enough to determine intent — a misconfigured proxy could send GET to a
 * destructive handler if we only guarded POST/PATCH/DELETE.
 */
function isAdminRoute(method: string, url: string): boolean {
  // Normalise away query strings so matching is against the path only
  const path = stripQuery(url);

  return path === "/admin" || path.startsWith("/admin/");
}

/**
 * Returns true for routes that require an authenticated session but do not
 * need admin role.
 */
function isAuthenticatedRoute(method: string, url: string): boolean {
  const path = stripQuery(url);

  // Server endpoints
  if (path === "/servers" || path.startsWith("/servers/")) return true;

  // Web-app endpoints
  if (path === "/webapps" || path.startsWith("/webapps/")) return true;

  // Single-page dashboard aggregation endpoint
  if (path === "/dashboard") return true;

  // Failure records — both reading and clearing require auth
  if (path === "/failures" || path.startsWith("/failures/")) return true;

  // Shared-hosting endpoints
  if (path === "/shared-hosting" || path.startsWith("/shared-hosting/")) return true;

  // Alerts endpoints (also have their own preHandler auth in route files)
  if (path === "/alerts" || path.startsWith("/alerts/")) return true;

  // Settings endpoints (also have their own preHandler auth in route files)
  if (path === "/settings" || path.startsWith("/settings/")) return true;

  // Profile endpoints (also have their own preHandler auth in route files)
  if (path === "/profile" || path.startsWith("/profile/")) return true;

  // Passkey management endpoints (register, list, delete — also have preHandler auth)
  if (path === "/passkeys" || path.startsWith("/passkeys/")) return true;

  // User management endpoints (also have their own preHandler auth in route files)
  if (path === "/users" || path.startsWith("/users/")) return true;

  return false;
}

/**
 * Returns true for routes that must remain publicly accessible.
 * These are explicitly allow-listed; everything else is denied by default.
 */
function isPublicRoute(method: string, url: string): boolean {
  const path = stripQuery(url);

  // Liveness / readiness probe — must never require auth so orchestrators
  // can poll it without credentials
  if (path === "/health") return true;

  // Agent reporting endpoint uses its own X-Agent-Key header checked inside
  // the handler; the session-auth layer must stay out of its way
  if (path === "/agents/report") return true;

  // Auth routes: login, setup, passkey challenge, 2FA, etc.
  if (path === "/auth" || path.startsWith("/auth/")) return true;

  // Passkey authenticate endpoints must be public (used during login flow)
  if (path === "/passkeys/authenticate/options" || path === "/passkeys/authenticate/verify") return true;

  return false;
}

function stripQuery(url: string): string {
  const qi = url.indexOf("?");
  return qi === -1 ? url : url.slice(0, qi);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function routeGuardPlugin(app: FastifyInstance): Promise<void> {
  app.addHook(
    "onRequest",
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const method = req.method.toUpperCase();

      // Use routeOptions.url when available (the registered pattern, e.g.
      // "/servers/:id") because it is normalised and cannot be manipulated via
      // URL encoding. Fall back to req.url for hooks that fire before routing.
      const url: string =
        (req.routeOptions as { url?: string } | undefined)?.url ?? req.url;

      // --- Public allow-list (checked first — short-circuit for hot paths) ---
      if (isPublicRoute(method, url)) {
        return;
      }

      // --- Admin routes ---
      if (isAdminRoute(method, url)) {
        return requireAdmin(req, reply);
      }

      // --- Authenticated routes ---
      if (isAuthenticatedRoute(method, url)) {
        return requireAuth(req, reply);
      }

      // --- Fail-closed default ---
      // Any route not explicitly classified above is denied. This prevents
      // accidentally-added endpoints from being exposed without auth review.
      // Developers will see a 403 immediately and must add classification above.
      reply.status(403).send({
        error: "forbidden",
        message: "This endpoint has not been assigned an auth policy."
      });
    }
  );
}
