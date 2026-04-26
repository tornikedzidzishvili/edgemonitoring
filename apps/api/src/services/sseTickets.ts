/**
 * SSE Ticket Store
 *
 * Provides single-use, short-lived tokens that allow the browser to open an
 * SSE connection without sending an Authorization header.  The native
 * EventSource API cannot set custom headers, so the client first calls
 * POST /servers/:id/stream-ticket (Bearer-authenticated) to obtain a ticket,
 * then opens the SSE URL with ?ticket=<value>.
 *
 * Security properties:
 *  - 32 bytes of crypto-grade randomness → 256-bit entropy ticket.
 *  - Single-use: the ticket is deleted on first use (replay-proof).
 *  - 60-second TTL: a leaked ticket is useless after one minute.
 *  - Server-scoped: the ticket is bound to a specific serverId so it cannot
 *    be replayed against a different server's stream.
 *  - User-scoped: the ticket carries the issuing userId so the stream handler
 *    knows who is watching.
 *  - Periodic sweep every 30 s prevents unbounded memory growth.  The
 *    interval is unref()'d so it never blocks process shutdown.
 */

import { randomBytes } from "crypto";

export interface SseTicketData {
  userId: string;
  serverId: string;
  expiresAt: Date;
}

// In-memory store: ticket (base64url string) → metadata.
const store = new Map<string, SseTicketData>();

// Sweep expired entries every 30 seconds.
const sweepInterval = setInterval(() => {
  const now = new Date();
  for (const [ticket, data] of store) {
    if (data.expiresAt < now) {
      store.delete(ticket);
    }
  }
}, 30_000);

// Unref so the interval never prevents the process from exiting cleanly.
sweepInterval.unref();

const TTL_MS = 60_000; // 60 seconds

/**
 * Issue a new ticket bound to the given userId and serverId.
 * Returns the ticket string and the absolute expiry timestamp.
 */
export function issueTicket(userId: string, serverId: string): { ticket: string; expiresAt: Date } {
  const ticket = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  store.set(ticket, { userId, serverId, expiresAt });
  return { ticket, expiresAt };
}

/**
 * Consume a ticket for the given serverId.
 *
 * Validates presence, expiry, and server binding in one call.
 * Deletes the ticket on success (single-use guarantee).
 *
 * Returns the SseTicketData on success, or null on any failure.
 * The caller should map null → 401 and log the reason.
 */
export function consumeTicket(
  ticket: string,
  serverId: string
): { data: SseTicketData; error: null } | { data: null; error: string } {
  const entry = store.get(ticket);

  if (!entry) {
    return { data: null, error: "ticket-not-found" };
  }

  if (entry.expiresAt < new Date()) {
    store.delete(ticket);
    return { data: null, error: "ticket-expired" };
  }

  if (entry.serverId !== serverId) {
    // Do NOT delete — wrong server may be an attack probe; keep it so the real
    // client can still use it if this was an accidental mismatch.
    return { data: null, error: "ticket-server-mismatch" };
  }

  // Consume: delete before returning so a race can never double-use it.
  store.delete(ticket);
  return { data: entry, error: null };
}
