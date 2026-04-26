/**
 * CyberPanel SSH helper functions — EMS-22
 *
 * These functions accept an already-established SSH session abstraction and
 * return parsed data. They do NOT open SSH connections, decrypt credentials,
 * or access the database. All of that belongs to the calling scheduler
 * (EMS-23).
 *
 * Security notes:
 * - The `domain` argument in getSslExpiry is strictly validated against an
 *   allowlist regex before being interpolated into a shell command. Any value
 *   that does not match is rejected immediately, preventing shell injection
 *   through a user-controlled or server-controlled hostname.
 * - All command output is treated as untrusted input: every parser is wrapped
 *   in try/catch and falls back to empty/null rather than throwing.
 * - No import of cryptoBox, prisma, or any DB model is present in this file.
 */

// ---------------------------------------------------------------------------
// Session abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal interface that the calling scheduler must satisfy.
 *
 * EMS-23 will create a thin adapter that wraps the live `ssh2.Client.exec`
 * call and returns this shape. The adapter pattern keeps this service at the
 * transport boundary: it never opens connections or holds credentials.
 *
 * `code` is `number` here (not `number | null`) because callers should
 * normalise a null exit code (signal-terminated process) to a non-zero value
 * before handing the result to this service.
 */
export interface SshSession {
  exec(cmd: string): Promise<{ stdout: string; stderr: string; code: number }>;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class CyberPanelUnavailableError extends Error {
  constructor(detail?: string) {
    super(detail ?? "cyberpanel CLI not available on target host");
    this.name = "CyberPanelUnavailableError";
  }
}

// ---------------------------------------------------------------------------
// listWebsites
// ---------------------------------------------------------------------------

export interface CyberPanelWebsite {
  domain: string;
  owner: string;
  phpVersion: string; // best-effort; "" when not parseable
}

/**
 * FQDN-like pattern used when the plain parser cannot extract a structured
 * record. Accepts labels up to 63 chars, at least one dot, total ≤ 253 chars.
 */
const DOMAIN_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * Try to parse a single plain-text line from `cyberpanel listWebsites`.
 *
 * CyberPanel versions emit different formats. Known variants:
 *   - "domain : owner : phpVersion"  (colon-delimited, padded)
 *   - "domain | owner | phpVersion"  (pipe-delimited, padded)
 *   - "domain   owner   phpVersion"  (fixed-width / whitespace-only)
 *
 * Strategy:
 *   1. Split on `:` or `|` — if we get ≥3 tokens, map them positionally.
 *   2. Otherwise split on whitespace ≥2 spaces — same mapping.
 *   3. Fall back to extracting just the domain via DOMAIN_RE regex scan.
 *   4. If none of the above yield a plausible domain, return null (omit row).
 */
function parsePlainWebsiteLine(line: string): CyberPanelWebsite | null {
  try {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Skip obvious header/separator lines
    if (/^[-=+|]+$/.test(trimmed)) return null;
    if (/^\s*(website|domain|owner|php)\s/i.test(trimmed)) return null;

    // 1. Colon or pipe split
    if (/[:| ]/.test(trimmed)) {
      const parts = trimmed
        .split(/\s*[:|]\s*/)
        .map((p) => p.trim())
        .filter(Boolean);

      if (parts.length >= 2 && DOMAIN_RE.test(parts[0])) {
        return {
          domain: parts[0],
          owner: parts[1] ?? "",
          phpVersion: parts[2] ?? "",
        };
      }
    }

    // 2. Whitespace split (≥2 spaces as field separator)
    {
      const parts = trimmed.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2 && DOMAIN_RE.test(parts[0])) {
        return {
          domain: parts[0],
          owner: parts[1] ?? "",
          phpVersion: parts[2] ?? "",
        };
      }
    }

    // 3. Regex scan for the first FQDN-like token anywhere in the line
    const match = DOMAIN_RE.exec(trimmed);
    if (match) {
      return { domain: match[0], owner: "", phpVersion: "" };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt to parse `cyberpanel listWebsites --json` output.
 *
 * The JSON schema has varied across CyberPanel versions. Known shapes:
 *   - Array of objects: [{ domain, owner, phpVersion }, ...]
 *   - Wrapped: { websiteList: [...] }
 *   - Wrapped: { data: [...] }
 *
 * Any unrecognised element is skipped (defensive); missing fields default to "".
 */
function parseJsonOutput(stdout: string): CyberPanelWebsite[] | null {
  try {
    const parsed: unknown = JSON.parse(stdout);

    let items: unknown[];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (
      parsed !== null &&
      typeof parsed === "object" &&
      "websiteList" in parsed &&
      Array.isArray((parsed as Record<string, unknown>).websiteList)
    ) {
      items = (parsed as Record<string, unknown>).websiteList as unknown[];
    } else if (
      parsed !== null &&
      typeof parsed === "object" &&
      "data" in parsed &&
      Array.isArray((parsed as Record<string, unknown>).data)
    ) {
      items = (parsed as Record<string, unknown>).data as unknown[];
    } else {
      return null;
    }

    const results: CyberPanelWebsite[] = [];
    for (const item of items) {
      try {
        if (item === null || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const domain = typeof obj.domain === "string" ? obj.domain.trim() : "";
        if (!domain || !DOMAIN_RE.test(domain)) continue;
        results.push({
          domain,
          owner: typeof obj.owner === "string" ? obj.owner.trim() : "",
          phpVersion:
            typeof obj.phpVersion === "string"
              ? obj.phpVersion.trim()
              : typeof obj.php_version === "string"
              ? obj.php_version.trim()
              : "",
        });
      } catch {
        // skip this element
      }
    }
    return results;
  } catch {
    return null; // not JSON — caller falls back to plain parser
  }
}

/**
 * List all websites on the CyberPanel host.
 *
 * Tries `cyberpanel listWebsites --json` first; falls back to plain-text
 * parsing of `cyberpanel listWebsites`.
 *
 * Throws `CyberPanelUnavailableError` if the CLI is not present on the host.
 */
export async function listWebsites(
  session: SshSession
): Promise<CyberPanelWebsite[]> {
  // --- JSON-first attempt ---
  const jsonResult = await session.exec("cyberpanel listWebsites --json");

  // Detect missing CLI regardless of which variant we ran
  const isMissingCli = (code: number, stderr: string, stdout: string): boolean =>
    code === 127 ||
    /command not found/i.test(stderr) ||
    /cyberpanel[:\s]+not found/i.test(stderr) ||
    /command not found/i.test(stdout) ||
    /cyberpanel[:\s]+not found/i.test(stdout);

  if (isMissingCli(jsonResult.code, jsonResult.stderr, jsonResult.stdout)) {
    throw new CyberPanelUnavailableError(
      `cyberpanel CLI not found on host (exit ${jsonResult.code})`
    );
  }

  // Try JSON parse if exit-code 0 and stdout looks like JSON
  if (jsonResult.code === 0 && jsonResult.stdout.trim().startsWith("{") ||
      jsonResult.code === 0 && jsonResult.stdout.trim().startsWith("[")) {
    const jsonWebsites = parseJsonOutput(jsonResult.stdout);
    if (jsonWebsites !== null) {
      return jsonWebsites;
    }
  }

  // --- Plain-text fallback ---
  // Re-run without --json if the first call gave us non-JSON output (some
  // versions ignore unknown flags and emit plain text anyway; others error on
  // --json). If the JSON call already returned plain text we reuse that stdout
  // to avoid a second round-trip.
  let plainStdout: string;
  let plainCode: number;
  let plainStderr: string;

  const looksLikeJson =
    jsonResult.stdout.trim().startsWith("{") ||
    jsonResult.stdout.trim().startsWith("[");

  if (!looksLikeJson || jsonResult.code !== 0) {
    // The --json call returned non-JSON (or failed non-127) — try plain command
    const plainResult = await session.exec("cyberpanel listWebsites");
    plainStdout = plainResult.stdout;
    plainCode = plainResult.code;
    plainStderr = plainResult.stderr;

    if (isMissingCli(plainCode, plainStderr, plainStdout)) {
      throw new CyberPanelUnavailableError(
        `cyberpanel CLI not found on host (exit ${plainCode})`
      );
    }
  } else {
    // The --json call gave us non-JSON stdout — reuse it as plain text
    plainStdout = jsonResult.stdout;
  }

  // Exit 0 with empty stdout → host has no websites (valid state)
  if (!plainStdout.trim()) {
    return [];
  }

  const websites: CyberPanelWebsite[] = [];
  for (const line of plainStdout.split(/\r?\n/)) {
    const parsed = parsePlainWebsiteLine(line);
    if (parsed !== null) {
      websites.push(parsed);
    }
  }
  return websites;
}

// ---------------------------------------------------------------------------
// getServiceStatuses
// ---------------------------------------------------------------------------

export interface CyberPanelServiceStatuses {
  lscpd: "active" | "inactive";
  lsws: "active" | "inactive";
  mariadb: "active" | "inactive";
}

/**
 * Map a `systemctl is-active` line to the two-value union.
 * Anything that is not exactly "active" is treated as "inactive".
 */
function toActiveStatus(line: string | undefined): "active" | "inactive" {
  return line?.trim() === "active" ? "active" : "inactive";
}

/**
 * Query the operational status of the three core CyberPanel services.
 *
 * `systemctl is-active` exits non-zero when any queried service is not active.
 * That is expected and is NOT treated as an error. We read stdout regardless
 * of exit code.
 *
 * If stdout has fewer than three lines, missing entries default to "inactive".
 */
export async function getServiceStatuses(
  session: SshSession
): Promise<CyberPanelServiceStatuses> {
  const result = await session.exec(
    "systemctl is-active lscpd lsws mariadb"
  );

  // Collect non-empty lines (strip trailing whitespace, skip blanks)
  const lines = result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // systemctl is-active outputs one line per service in the order requested:
  // line[0] = lscpd, line[1] = lsws, line[2] = mariadb
  return {
    lscpd: toActiveStatus(lines[0]),
    lsws: toActiveStatus(lines[1]),
    mariadb: toActiveStatus(lines[2]),
  };
}

// ---------------------------------------------------------------------------
// getSslExpiry
// ---------------------------------------------------------------------------

export interface CyberPanelSslExpiry {
  expiresAt: Date | null;
}

/**
 * Allowlist regex for domain names passed to getSslExpiry.
 *
 * Permits: letters (a-z, A-Z), digits (0-9), hyphens, and dots.
 * Rejects: any other character, including shell metacharacters such as
 *   ;  &  |  $  `  (  )  {  }  <  >  \  /  spaces  newlines etc.
 *
 * Combined with the 253-character length cap this covers all valid FQDNs
 * while making shell injection through the domain parameter impossible.
 */
const DOMAIN_ALLOWLIST_RE = /^[a-zA-Z0-9.-]+$/;
const DOMAIN_MAX_LENGTH = 253;

/**
 * Regex that extracts the date portion from openssl output like:
 *   notAfter=Apr 27 12:34:56 2026 GMT
 *
 * Capture group 1 is the full date string passed to `new Date()`.
 */
const NOT_AFTER_RE = /notAfter=(.+)/;

/**
 * Return the SSL certificate expiry date for the given domain.
 *
 * The domain argument is sanitised before use in a shell command.
 * Returns `{ expiresAt: null }` on any failure — this function never throws.
 */
export async function getSslExpiry(
  session: SshSession,
  domain: string
): Promise<CyberPanelSslExpiry> {
  // --- Domain sanitisation: reject anything that is not a safe FQDN ---
  if (
    !domain ||
    domain.length > DOMAIN_MAX_LENGTH ||
    !DOMAIN_ALLOWLIST_RE.test(domain)
  ) {
    // Log a warning without echoing the raw domain to avoid leaking
    // potentially malicious payloads into structured logs.
    console.warn(
      `[cyberpanel] getSslExpiry: rejected unsafe domain argument ` +
        `(length=${domain.length}, failed allowlist check)`
    );
    return { expiresAt: null };
  }

  try {
    const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    const result = await session.exec(
      `openssl x509 -enddate -noout -in ${certPath}`
    );

    // Non-zero exit: cert file missing, openssl not present, etc.
    if (result.code !== 0) {
      return { expiresAt: null };
    }

    const match = NOT_AFTER_RE.exec(result.stdout);
    if (!match || !match[1]) {
      return { expiresAt: null };
    }

    const parsed = new Date(match[1].trim());
    if (isNaN(parsed.getTime())) {
      return { expiresAt: null };
    }

    return { expiresAt: parsed };
  } catch {
    return { expiresAt: null };
  }
}
