/**
 * CyberPanel Sync — EMS-23
 *
 * Connects to a CyberPanel host over SSH, calls the EMS-22 helper functions,
 * and persists the resulting inventory into SharedHostingDomain rows.
 *
 * Security notes:
 * - SSH private keys are decrypted in-memory only for the duration of each
 *   sync call and are never logged, returned, or written to disk.
 * - Per-server errors are caught and logged with only a sanitized string;
 *   raw ssh2 library errors may contain session context, so we truncate to
 *   err.message.slice(0, 200) before writing to lastSyncError.
 * - Plaintext credential variables are confined to the local scope of
 *   syncCyberPanel; they are never passed to any logging call.
 *
 * Trade-off note:
 * - `serviceStatus` (lscpd / lsws / mariadb) is a server-wide snapshot, but
 *   the schema stores it as a JSON blob on each SharedHostingDomain row.
 *   Every domain belonging to the same CyberPanel host will carry an identical
 *   `serviceStatus` blob after each sync cycle. This is intentional: it lets
 *   the frontend display service health alongside the domain it cares about,
 *   without adding a separate CyberPanel-host-level table. The redundancy is
 *   acceptable at current scale.
 */

import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { decryptString } from "../cryptoBox.js";
import { openSshSession } from "../sshProbe.js";
import {
  listWebsites,
  getServiceStatuses,
  getSslExpiry,
  CyberPanelUnavailableError,
} from "./cyberpanel.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a SharedHostingServer row with its linked SshKey, as
 * selected by the calling scheduler. Fields map directly to the Prisma schema
 * defined in EMS-21.
 */
interface CyberPanelServer {
  id: string;
  name: string;
  sshKeyId: string | null;
  sshUser: string | null;
  sshPort: number | null;
  // EMS-31: sshHost is the canonical host/IP for CyberPanel SSH connections.
  // apiUrl is kept for the sshHost ?? apiUrl fallback so that any production
  // rows that pre-date EMS-31 (which stored the host in apiUrl) continue to
  // work until they are re-saved with an explicit sshHost value.
  sshHost: string | null;
  apiUrl: string | null;
  sshKey: {
    privateKeyEnc: string;
    privateKeyIv: string;
    privateKeyTag: string;
    passphraseEnc: string | null;
    passphraseIv: string | null;
    passphraseTag: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Per-server timeout helper
// ---------------------------------------------------------------------------

const SYNC_TIMEOUT_MS = 10_000; // 10 seconds per server

/**
 * Returns a promise that rejects with a sentinel error after SYNC_TIMEOUT_MS.
 * The caller uses Promise.race([ work, timeout() ]) to enforce the budget.
 */
function makeTimeoutPromise(): Promise<never> {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("cyberpanel-sync-timeout")), SYNC_TIMEOUT_MS);
  });
}

// ---------------------------------------------------------------------------
// syncCyberPanel
// ---------------------------------------------------------------------------

/**
 * Synchronise a single CyberPanel server into the SharedHosting/
 * SharedHostingDomain tables.
 *
 * Called by the shared-hosting sync scheduler for each enabled
 * SharedHostingServer row whose `type === "cyberpanel"`.
 *
 * On any failure path the function sets `lastSyncError` to a short sanitized
 * string on the SharedHostingServer row and returns without throwing, so the
 * calling scheduler loop can continue with the next server.
 */
export async function syncCyberPanel(
  prisma: PrismaClient,
  env: Env,
  server: CyberPanelServer
): Promise<void> {
  // --- 1. Pre-validate structural requirements ---
  if (!server.sshKeyId || !server.sshKey) {
    console.warn(
      `[cyberpanel-sync] skip serverId=${server.id} reason=missing-ssh-key`
    );
    await prisma.sharedHostingServer.update({
      where: { id: server.id },
      data: { lastSyncError: "missing-ssh-key" },
    });
    return;
  }

  // EMS-31: sshHost is the canonical host/IP for CyberPanel SSH connections.
  // Fall back to apiUrl for rows that pre-date EMS-31 (none expected in
  // production, but kept as a safety net).
  const resolvedHost = server.sshHost ?? server.apiUrl;
  if (!resolvedHost) {
    console.warn(
      `[cyberpanel-sync] skip serverId=${server.id} reason=missing-ssh-host`
    );
    await prisma.sharedHostingServer.update({
      where: { id: server.id },
      data: { lastSyncError: "missing-ssh-host" },
    });
    return;
  }

  // --- 2. Decrypt credentials in-memory; NEVER log these values ---
  let privateKey: string;
  try {
    privateKey = decryptString(
      {
        enc: server.sshKey.privateKeyEnc,
        iv: server.sshKey.privateKeyIv,
        tag: server.sshKey.privateKeyTag,
      },
      env.SSH_KEY_MASTER_SECRET
    );
  } catch {
    console.warn(
      `[cyberpanel-sync] skip serverId=${server.id} reason=credential-decrypt-failed`
    );
    await prisma.sharedHostingServer.update({
      where: { id: server.id },
      data: { lastSyncError: "credential-decrypt-failed" },
    });
    return;
  }

  let passphrase: string | undefined;
  if (
    server.sshKey.passphraseEnc !== null &&
    server.sshKey.passphraseIv !== null &&
    server.sshKey.passphraseTag !== null
  ) {
    try {
      passphrase = decryptString(
        {
          enc: server.sshKey.passphraseEnc,
          iv: server.sshKey.passphraseIv,
          tag: server.sshKey.passphraseTag,
        },
        env.SSH_KEY_MASTER_SECRET
      );
    } catch {
      console.warn(
        `[cyberpanel-sync] skip serverId=${server.id} reason=credential-decrypt-failed`
      );
      await prisma.sharedHostingServer.update({
        where: { id: server.id },
        data: { lastSyncError: "credential-decrypt-failed" },
      });
      return;
    }
  }

  // --- 3. Open SSH session and run sync under a 10-second per-server budget ---
  // The session is opened OUTSIDE the timeout race so the connection attempt
  // itself also falls within the budget. The SSH connect has its own internal
  // timeout (readyTimeout in connectSsh), but we want the overall envelope
  // capped too.
  const syncWork = async (): Promise<void> => {
    // The ssh connection timeout is set to SYNC_TIMEOUT_MS so that if the host
    // is unreachable the connect itself times out within the overall budget.
    const session = await openSshSession({
      host: resolvedHost,
      port: server.sshPort ?? 22,
      username: server.sshUser ?? "root",
      privateKey,
      passphrase,
      timeoutMs: SYNC_TIMEOUT_MS,
      execTimeoutMs: SYNC_TIMEOUT_MS,
    });

    // Always close the session when we're done, whether success or failure.
    try {
      // --- 4. Call the three EMS-22 helpers ---
      const websites = await listWebsites(session);
      const serviceStatuses = await getServiceStatuses(session);

      // --- 5. Persist via Prisma ---
      // serviceStatus is server-wide; every domain on this host gets the same
      // snapshot blob (see trade-off note at top of file).
      const serviceStatusJson = JSON.stringify(serviceStatuses);

      for (const website of websites) {
        // Fetch SSL expiry for this domain. getSslExpiry never throws.
        const { expiresAt } = await getSslExpiry(session, website.domain);

        // Find or create the parent SharedHosting account (keyed by owner name
        // + serverId — analogous to how the Plesk path uses pleskCustomerId).
        let account = await prisma.sharedHosting.findFirst({
          where: {
            serverId: server.id,
            name: website.owner || "CyberPanel Admin",
          },
        });

        if (!account) {
          account = await prisma.sharedHosting.create({
            data: {
              name: website.owner || "CyberPanel Admin",
              serverId: server.id,
            },
          });
        }

        // Upsert the domain row.
        // @@unique([sharedHostingId, domain]) is the natural key.
        await prisma.sharedHostingDomain.upsert({
          where: {
            sharedHostingId_domain: {
              sharedHostingId: account.id,
              domain: website.domain,
            },
          },
          create: {
            sharedHostingId: account.id,
            domain: website.domain,
            enabled: true,
            customerName: website.owner || null,
            sslExpiresAt: expiresAt,
            sslLastChecked: new Date(),
            serviceStatus: serviceStatusJson,
          },
          update: {
            customerName: website.owner || null,
            sslExpiresAt: expiresAt,
            sslLastChecked: new Date(),
            serviceStatus: serviceStatusJson,
          },
        });
      }

      // --- 6. Mark success on the SharedHostingServer row ---
      await prisma.sharedHostingServer.update({
        where: { id: server.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncError: null,
        },
      });

      console.info(`[cyberpanel-sync] ok serverId=${server.id} domains=${websites.length}`);
    } finally {
      // --- 8. Always close the SSH session ---
      session.close();
    }
  };

  // Wrap syncWork in a Promise.race against a timeout sentinel.
  try {
    await Promise.race([syncWork(), makeTimeoutPromise()]);
  } catch (err) {
    // Determine the appropriate sanitised error string.
    let syncError: string;

    if (err instanceof CyberPanelUnavailableError) {
      syncError = "cyberpanel-cli-not-found";
      console.warn(
        `[cyberpanel-sync] skip serverId=${server.id} reason=${syncError}`
      );
    } else if (err instanceof Error && err.message === "cyberpanel-sync-timeout") {
      syncError = "timeout";
      console.warn(
        `[cyberpanel-sync] timeout serverId=${server.id}`
      );
    } else {
      // Sanitize: only the message, truncated, never raw library output.
      syncError =
        err instanceof Error ? err.message.slice(0, 200) : "unknown-error";
      console.error(
        `[cyberpanel-sync] failed serverId=${server.id} error="${syncError}"`
      );
    }

    await prisma.sharedHostingServer.update({
      where: { id: server.id },
      data: { lastSyncError: syncError },
    });
  }
}
