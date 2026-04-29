/**
 * Host Stack Detector (EMS-46)
 *
 * Background: A production incident on a CyberPanel host (23.88.126.76) exposed
 * a hard failure mode — the host had only the legacy Docker builder (no BuildKit),
 * but its server record had `monitoringMode = "agent"`. The `deploy-ubuntu.sh`
 * script uses BuildKit-only `--mount=type=cache` syntax, so the install failed
 * silently. This module probes a remote host over an already-open SSH session and
 * returns a structured profile describing its stack. `resolveMonitoringMode` then
 * maps that profile to the safest install path without requiring operator
 * knowledge of the host's internals.
 *
 * Typical caller pattern:
 *
 *   import { openSshSession } from "../sshProbe.js";
 *   import { detectHostStack, resolveMonitoringMode } from "./hostStackDetector.js";
 *
 *   const session = await openSshSession({ host, port, username, privateKey });
 *   try {
 *     const profile = await detectHostStack(session);
 *     const mode    = resolveMonitoringMode(profile);
 *     // persist `mode` on the Server record, or present to operator for override
 *   } finally {
 *     session.close();
 *   }
 *
 * Note: Mutating the remote host's Docker daemon configuration (e.g. writing to
 * /etc/docker/daemon.json or restarting the docker service) is intentionally out
 * of scope. If BuildKit is absent the system falls back to `agent_systemd`; the
 * operator may override via the UI (EMS-49). We never silently alter production
 * host configuration.
 */

import type { OpenSshSession } from "../sshProbe.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HostStackProfile = {
  /** True if CyberPanel is installed on the host. */
  hasCyberPanel: boolean;
  /** True if the `docker` CLI is available on the host. */
  hasDocker: boolean;
  /**
   * True if `docker buildx` is available (BuildKit-capable builder present).
   * Meaningful only when `hasDocker` is true.
   */
  hasDockerBuildKit: boolean;
  /** True if `systemctl` is available (systemd-managed init). */
  hasSystemd: boolean;
  /**
   * OS family string from /etc/os-release (ID_LIKE, falling back to ID).
   * Examples: "debian", "ubuntu", "rhel fedora". Empty string on failure or
   * on distros that do not ship /etc/os-release.
   */
  distro: string;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class HostStackDetectTimeoutError extends Error {
  constructor() {
    super(
      "detectHostStack: overall detection budget (8 s) exceeded — host may be unresponsive"
    );
    this.name = "HostStackDetectTimeoutError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DETECT_TIMEOUT_MS = 8_000;

/**
 * Run `session.exec(cmd)` and return trimmed stdout on success (exit code 0),
 * or `fallback` on any error or non-zero exit. The probe name is included in
 * any log output; no raw stdout/stderr is forwarded to avoid leaking file
 * contents from a potentially compromised host.
 */
async function safeExec(
  session: OpenSshSession,
  cmd: string,
  probeName: string,
  fallback: string
): Promise<string> {
  try {
    const result = await session.exec(cmd);
    if (result.code !== 0) {
      // Non-zero exit is an expected non-fatal result (e.g. binary not found).
      return fallback;
    }
    return result.stdout.trim();
  } catch (err) {
    // Log probe name and error category only — never include stdout/stderr
    // that could contain host file contents or sensitive data.
    const category =
      err instanceof Error ? err.constructor.name || "Error" : "UnknownError";
    console.warn(
      `[hostStackDetector] probe "${probeName}" failed (${category}) — treating as absent`
    );
    return fallback;
  }
}

/**
 * Determine whether the output of a `safeExec` probe indicates a positive
 * result. Accepts "yes" (the explicit echo from our probe commands) or any
 * non-empty, non-"no" string.
 */
function isYes(output: string): boolean {
  const lower = output.toLowerCase().trim();
  return lower === "yes" || (lower.length > 0 && lower !== "no");
}

/**
 * Parse the distro field from an /etc/os-release line.
 * Strips the key prefix (ID_LIKE= or ID=) and surrounding quotes.
 */
function parseOsReleaseValue(raw: string): string {
  // raw may be: ID_LIKE=debian  or  ID_LIKE="debian ubuntu"  or  ID=ubuntu
  const eqIdx = raw.indexOf("=");
  if (eqIdx === -1) return "";
  const value = raw.slice(eqIdx + 1).trim();
  // Remove surrounding double or single quotes
  return value.replace(/^["']|["']$/g, "");
}

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

/**
 * Probe the host described by `session` and return a structured HostStackProfile.
 *
 * All five probes run in parallel. Each is non-fatal: a thrown exception or a
 * non-zero exit code yields the safe default (`false` / `""`). The entire set
 * of probes is hard-capped at 8 seconds; if the cap fires a
 * `HostStackDetectTimeoutError` is thrown (the only exception this function
 * can raise).
 */
export async function detectHostStack(
  session: OpenSshSession
): Promise<HostStackProfile> {
  const detect = async (): Promise<HostStackProfile> => {
    // All probes run concurrently to minimise total wall-clock time.
    const [
      cyberPanelDir,
      cyberPanelCmd,
      dockerOutput,
      buildkitOutput,
      systemctlOutput,
      idLikeOutput,
    ] = await Promise.all([
      // CyberPanel — directory presence
      safeExec(
        session,
        "test -d /usr/local/CyberCP && echo yes || echo no",
        "cyberpanel-dir",
        "no"
      ),
      // CyberPanel — binary presence (fallback check)
      safeExec(
        session,
        "command -v cyberpanel >/dev/null 2>&1 && echo yes || echo no",
        "cyberpanel-cmd",
        "no"
      ),
      // Docker CLI availability
      safeExec(
        session,
        "command -v docker >/dev/null 2>&1 && echo yes || echo no",
        "docker",
        "no"
      ),
      // Docker BuildKit (buildx subcommand)
      safeExec(
        session,
        "docker buildx version >/dev/null 2>&1 && echo yes || echo no",
        "docker-buildkit",
        "no"
      ),
      // systemd (systemctl binary)
      safeExec(
        session,
        "command -v systemctl >/dev/null 2>&1 && echo yes || echo no",
        "systemd",
        "no"
      ),
      // OS distro — prefer ID_LIKE, fall back to ID
      safeExec(
        session,
        "grep ^ID_LIKE /etc/os-release 2>/dev/null || grep ^ID= /etc/os-release 2>/dev/null || true",
        "os-release",
        ""
      ),
    ]);

    return {
      hasCyberPanel: isYes(cyberPanelDir) || isYes(cyberPanelCmd),
      hasDocker: isYes(dockerOutput),
      hasDockerBuildKit: isYes(buildkitOutput),
      hasSystemd: isYes(systemctlOutput),
      distro: parseOsReleaseValue(idLikeOutput),
    };
  };

  // Hard cap: if the host is slow or hung we must not block the caller forever.
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new HostStackDetectTimeoutError()),
      DETECT_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([detect(), timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

/**
 * Map a HostStackProfile to the recommended MonitoringMode.
 *
 * Decision tree (in priority order):
 *
 * 1. CyberPanel host → "agent_systemd"
 *    CyberPanel runs OpenLiteSpeed and manages its own process tree; Docker
 *    containers conflict with its resource isolation. The systemd agent is
 *    the supported path for these hosts.
 *
 * 2. Docker + BuildKit → "agent"
 *    Full Docker stack with BuildKit present; deploy-ubuntu.sh can run
 *    without modification.
 *
 * 3. Docker without BuildKit → "agent_systemd"
 *    Legacy builder only. We do NOT mutate /etc/docker/daemon.json or
 *    restart the Docker daemon. The systemd fallback avoids the BuildKit
 *    syntax error that triggered the original production incident.
 *
 * 4. No Docker at all → "agent_systemd"
 *    Systemd agent is self-contained (no container runtime dependency).
 */
export function resolveMonitoringMode(
  profile: HostStackProfile
): "agent" | "agent_systemd" {
  if (profile.hasCyberPanel) {
    return "agent_systemd";
  }
  if (profile.hasDocker && profile.hasDockerBuildKit) {
    return "agent";
  }
  // Docker present but legacy builder only — or no Docker at all.
  // Either way, systemd is the safe fallback.
  return "agent_systemd";
}
