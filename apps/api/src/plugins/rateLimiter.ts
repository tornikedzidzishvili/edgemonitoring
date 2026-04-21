/**
 * rateLimiter plugin
 *
 * In-memory, per-identity sliding-window rate limiter using a simple
 * request-count approach. Limits are intentionally conservative to protect:
 *  - Auth endpoints against credential-stuffing and brute-force attacks
 *  - Agent report endpoint against a misbehaving or compromised agent
 *    flooding the ingest pipeline
 *  - All other endpoints as a general DoS guard
 *
 * Security notes:
 *  - IP is read from req.ip, which Fastify resolves via the trustProxy
 *    setting. Ensure trustProxy is configured correctly in production so
 *    an attacker cannot spoof X-Forwarded-For to bypass per-IP limits.
 *  - For /agents/report the bucket key is derived from the SHA-256 hash of
 *    the X-Agent-Key header, falling back to IP only when the header is
 *    absent. This prevents NAT'd agents behind a shared IP from consuming
 *    each other's rate-limit quota. The plaintext key is NEVER stored in
 *    the bucket map — only the hex-encoded SHA-256 digest is kept.
 *    Key-derivation rule:
 *      bucket_key = "agentKey:" + SHA256(X-Agent-Key)  // if header present
 *      bucket_key = "ip:" + req.ip                      // fallback
 *  - The cleanup interval prevents unbounded memory growth from unique IPs.
 *  - 429 responses never include internal counters to avoid timing attacks.
 */

import { createHash } from "node:crypto";
import fp from "fastify-plugin";
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

/**
 * Derives the rate-limit bucket identity for /agents/report requests.
 *
 * If the X-Agent-Key header is present, the bucket key is:
 *   "agentKey:" + SHA256(headerValue)
 *
 * This gives each agent its own 120 req/min quota regardless of shared NAT.
 * The plaintext key is never stored — only the hex-encoded SHA-256 digest
 * lives in the Map, so a memory dump of the rate-limiter state cannot reveal
 * plaintext agent credentials.
 *
 * Falls back to "ip:<req.ip>" if the header is absent (unauthenticated or
 * malformed requests still get a bucket — the handler will reject them with
 * 401, but we rate-limit them first to prevent enumeration).
 */
function agentReportBucketKey(req: FastifyRequest): string {
  const rawKey = req.headers["x-agent-key"];
  if (rawKey && typeof rawKey === "string" && rawKey.length > 0) {
    const digest = createHash("sha256").update(rawKey).digest("hex");
    return `agentKey:${digest}`;
  }
  return `ip:${req.ip}`;
}

function getEntry(path: string, bucketId: string, windowMs: number): BucketEntry {
  let perBucket = buckets.get(path);
  if (!perBucket) {
    perBucket = new Map();
    buckets.set(path, perBucket);
  }

  const now = Date.now();
  let entry = perBucket.get(bucketId);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    entry = { count: 0, windowStart: now };
    perBucket.set(bucketId, entry);
  }

  return entry;
}

// ---------------------------------------------------------------------------
// Cleanup — prevent memory growth from unique or rotating IPs
// ---------------------------------------------------------------------------

function pruneExpiredBuckets(): void {
  const now = Date.now();

  for (const [path, perBucket] of buckets) {
    for (const [bucketId, entry] of perBucket) {
      // Use the most permissive window (agentReport) so we don't prune entries
      // that are still live under a longer window. In practice all windows are
      // 60 s, so this is just defensive.
      if (now - entry.windowStart >= WINDOW_MS * 2) {
        perBucket.delete(bucketId);
      }
    }

    if (perBucket.size === 0) {
      buckets.delete(path);
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

async function rateLimiterPluginImpl(app: FastifyInstance): Promise<void> {
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
      const limit = getLimit(path);

      // For the agent-report endpoint, key the bucket on the hashed agent key
      // rather than IP so NAT'd agents don't compete for the same quota.
      // All other routes continue to use IP-based bucketing.
      const bucketId =
        path === "/agents/report" ? agentReportBucketKey(req) : req.ip;

      const entry = getEntry(path, bucketId, limit.windowMs);
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

// fp() is required so the onRequest hook attaches to the root Fastify instance.
// Without it the hook is scoped to an encapsulated child context and rate
// limiting does not apply to sibling route plugins.
export const rateLimiterPlugin = fp(rateLimiterPluginImpl, {
  name: "rateLimiter",
  fastify: "5.x",
});
