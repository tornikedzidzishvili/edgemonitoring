/**
 * rateLimiter plugin
 *
 * In-memory, per-IP sliding-window rate limiter using a simple request-count
 * approach. Limits are intentionally conservative to protect:
 *  - Auth endpoints against credential-stuffing and brute-force attacks
 *  - Agent report endpoint against a misbehaving or compromised agent
 *    flooding the ingest pipeline
 *  - All other endpoints as a general DoS guard
 *
 * Security notes:
 *  - IP is read from req.ip, which Fastify resolves via the trustProxy
 *    setting. Ensure trustProxy is configured correctly in production so
 *    an attacker cannot spoof X-Forwarded-For to bypass per-IP limits.
 *  - The cleanup interval prevents unbounded memory growth from unique IPs.
 *  - 429 responses never include internal counters to avoid timing attacks.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

// ---------------------------------------------------------------------------
// Limit definitions
// ---------------------------------------------------------------------------

interface LimitRule {
  /** Maximum requests allowed within the window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
}

const WINDOW_MS = 60_000; // 1 minute

const LIMITS = {
  authStrict: { max: 10, windowMs: WINDOW_MS },  // login / setup
  agentReport: { max: 120, windowMs: WINDOW_MS }, // one report every ~30 s is normal
  default: { max: 100, windowMs: WINDOW_MS },
} satisfies Record<string, LimitRule>;

// ---------------------------------------------------------------------------
// Route → limit mapping
// ---------------------------------------------------------------------------

function getLimit(url: string): LimitRule {
  const path = stripQuery(url);

  if (path === "/auth/login" || path === "/auth/setup") {
    return LIMITS.authStrict;
  }

  if (path === "/agents/report") {
    return LIMITS.agentReport;
  }

  return LIMITS.default;
}

function stripQuery(url: string): string {
  const qi = url.indexOf("?");
  return qi === -1 ? url : url.slice(0, qi);
}

// ---------------------------------------------------------------------------
// Tracking state
// ---------------------------------------------------------------------------

interface BucketEntry {
  count: number;
  /** Unix ms timestamp when this window started */
  windowStart: number;
}

/**
 * Two-level map: path → ip → bucket.
 *
 * Keying on path (not just IP) keeps the per-route limit independent — an IP
 * hammering /auth/login cannot exhaust the agent-report allowance.
 */
const buckets = new Map<string, Map<string, BucketEntry>>();

function getEntry(path: string, ip: string, windowMs: number): BucketEntry {
  let perIp = buckets.get(path);
  if (!perIp) {
    perIp = new Map();
    buckets.set(path, perIp);
  }

  const now = Date.now();
  let entry = perIp.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    entry = { count: 0, windowStart: now };
    perIp.set(ip, entry);
  }

  return entry;
}

// ---------------------------------------------------------------------------
// Cleanup — prevent memory growth from unique or rotating IPs
// ---------------------------------------------------------------------------

function pruneExpiredBuckets(): void {
  const now = Date.now();

  for (const [path, perIp] of buckets) {
    for (const [ip, entry] of perIp) {
      // Use the most permissive window (agentReport) so we don't prune entries
      // that are still live under a longer window. In practice all windows are
      // 60 s, so this is just defensive.
      if (now - entry.windowStart >= WINDOW_MS * 2) {
        perIp.delete(ip);
      }
    }

    if (perIp.size === 0) {
      buckets.delete(path);
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function rateLimiterPlugin(app: FastifyInstance): Promise<void> {
  // Schedule periodic cleanup. The interval reference is intentionally not
  // stored because it should run for the lifetime of the process.
  const cleanupInterval = setInterval(pruneExpiredBuckets, WINDOW_MS);

  // Ensure the interval does not keep the Node.js event loop alive when
  // the server is shutting down gracefully.
  cleanupInterval.unref();

  app.addHook(
    "onRequest",
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      // Use the registered route pattern when available for consistent bucketing
      // across parameterised paths (e.g., /servers/:id counts the same as any
      // other /servers/* call). Fall back to raw URL for un-routed requests.
      const url: string =
        (req.routeOptions as { url?: string } | undefined)?.url ?? req.url;

      const path = stripQuery(url);
      const ip = req.ip;
      const limit = getLimit(path);

      const entry = getEntry(path, ip, limit.windowMs);
      entry.count += 1;

      // Set standard rate-limit headers so clients can back off gracefully
      const remaining = Math.max(0, limit.max - entry.count);
      const resetSec = Math.ceil((entry.windowStart + limit.windowMs) / 1000);

      reply.header("X-RateLimit-Limit", String(limit.max));
      reply.header("X-RateLimit-Remaining", String(remaining));
      reply.header("X-RateLimit-Reset", String(resetSec));

      if (entry.count > limit.max) {
        // Do not reveal internal counters or exact window state in the body
        reply
          .status(429)
          .header("Retry-After", String(Math.ceil(limit.windowMs / 1000)))
          .send({ error: "too_many_requests", message: "Rate limit exceeded. Please try again later." });
      }
    }
  );
}
