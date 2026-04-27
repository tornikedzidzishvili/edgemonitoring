/**
 * Agent Installer (EMS-43)
 *
 * Streams a small wrapper script over SSH that:
 *   1. Curls the appropriate deploy script from edgemonitoringagent@<latest-tag>
 *   2. Runs it with --non-interactive and the right env vars
 *
 * Two modes are supported:
 *   - "agent"          → deploy-ubuntu.sh (Docker)
 *   - "agent_systemd"  → deploy-cyberpanel.sh (native systemd, no Docker)
 *
 * The hardened deploy scripts live in tornikedzidzishvili/edgemonitoringagent.
 * This file does NOT embed the install logic itself.
 */

import { request } from "undici";
import { Client } from "ssh2";

const AGENT_REPO = "tornikedzidzishvili/edgemonitoringagent";
const FALLBACK_TAG = "v0.2.0";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry { tag: string; expiresAt: number }
let latestTagCache: CacheEntry | null = null;

export async function getLatestAgentTag(): Promise<string> {
  if (latestTagCache && latestTagCache.expiresAt > Date.now()) {
    return latestTagCache.tag;
  }
  try {
    const { statusCode, body } = await request(
      `https://api.github.com/repos/${AGENT_REPO}/releases/latest`,
      {
        headers: { "User-Agent": "edge-monitoring-dashboard", Accept: "application/vnd.github+json" },
        bodyTimeout: 5000,
        headersTimeout: 5000,
      }
    );
    if (statusCode !== 200) throw new Error(`status ${statusCode}`);
    const json = (await body.json()) as { tag_name?: string };
    const tag = json.tag_name;
    if (typeof tag !== "string" || !tag.startsWith("v")) throw new Error("invalid tag_name");
    latestTagCache = { tag, expiresAt: Date.now() + CACHE_TTL_MS };
    return tag;
  } catch (err) {
    console.warn(`[agentInstaller] failed to fetch latest tag (${(err as Error).message}), using fallback ${FALLBACK_TAG}`);
    return FALLBACK_TAG;
  }
}

function buildWrapperScript(opts: {
  monitoringMode: "agent" | "agent_systemd";
  apiUrl: string;
  serverName: string;
  tag: string;
  reportIntervalSeconds?: number;
}): string {
  const scriptName = opts.monitoringMode === "agent" ? "deploy-ubuntu.sh" : "deploy-cyberpanel.sh";
  const interval = opts.reportIntervalSeconds ?? 30;
  // AGENT_API_KEY is NOT in the script body — it is delivered via the SSH exec
  // channel env (see conn.exec options). The `export AGENT_API_KEY` line below
  // re-exports it so child processes (sudo -E bash) inherit it.
  return `#!/usr/bin/env bash
set -euo pipefail

# Edge Monitoring Dashboard — installer wrapper
# Fetches and runs ${scriptName} from edgemonitoringagent at tag ${opts.tag}
# Generated at ${new Date().toISOString()}

export AGENT_API_KEY  # provided by SSH session env
export CENTRAL_API_URL=${JSON.stringify(opts.apiUrl)}
export SERVER_NAME=${JSON.stringify(opts.serverName)}
export REPORT_INTERVAL_SECONDS=${interval}

echo ">>> Fetching ${scriptName} from edgemonitoringagent@${opts.tag}"
curl -fsSL "https://raw.githubusercontent.com/${AGENT_REPO}/${opts.tag}/scripts/${scriptName}" \\
  -o /tmp/edge-deploy.sh

echo ">>> Running ${scriptName} (--tag ${opts.tag} --non-interactive)"
sudo -E bash /tmp/edge-deploy.sh --tag ${opts.tag} --non-interactive
rm -f /tmp/edge-deploy.sh
echo ">>> Install complete"
`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstallAgentParams = {
  host: string;
  port: number;
  username: string;
  privateKey: string;
  passphrase?: string;
  apiUrl: string;
  /** Plaintext API key — never emitted in log lines (scrubbed by safeEmit). */
  apiKey: string;
  serverName: string;
  monitoringMode: "agent" | "agent_systemd";
  reportIntervalSeconds?: number;
  timeoutMs?: number;
};

export type InstallAgentResult = { ok: boolean; exitCode: number | null };

/** Receives fully-formed NDJSON strings (no trailing newline) — caller appends "\n". */
export type EmitFn = (jsonLine: string) => void;

// ---------------------------------------------------------------------------
// Line-buffered stream helper
// ---------------------------------------------------------------------------

function makeLineBuffer(onLine: (line: string) => void): {
  push: (chunk: Buffer | string) => void;
  flush: () => void;
} {
  let buf = "";
  return {
    push(chunk) {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        onLine(buf.slice(0, nl).replace(/\r$/, ""));
        buf = buf.slice(nl + 1);
      }
    },
    flush() {
      if (buf.length > 0) { onLine(buf.replace(/\r$/, "")); buf = ""; }
    },
  };
}

// ---------------------------------------------------------------------------
// Core installer
// ---------------------------------------------------------------------------

/**
 * Connects via SSH, rotates the server's agent API key, then pipes the wrapper
 * script to `bash -s` stdin.
 *
 * AGENT_API_KEY is delivered via the ssh2 exec-channel `env` option — never in
 * argv, never in the script body — keeping it out of `ps -ef` and bash tracing.
 * safeEmit scrubs it from all NDJSON lines as a defense-in-depth backstop.
 */
export async function installAgentOverSsh(
  params: InstallAgentParams,
  emit: EmitFn
): Promise<InstallAgentResult> {
  const timeoutMs = params.timeoutMs ?? 5 * 60 * 1000;

  function safeEmit(jsonLine: string): void {
    emit(jsonLine.replaceAll(params.apiKey, "[REDACTED]"));
  }
  function emitStatus(phase: "connecting" | "rotating-key" | "running-installer" | "done", message: string): void {
    safeEmit(JSON.stringify({ type: "status", phase, message }));
  }
  function emitLog(stream: "stdout" | "stderr", line: string): void {
    safeEmit(JSON.stringify({ type: "log", stream, line }));
  }
  function emitError(message: string): void {
    safeEmit(JSON.stringify({ type: "error", message }));
  }
  function emitDone(ok: boolean, exitCode: number | null): void {
    safeEmit(JSON.stringify({ type: "done", ok, exitCode }));
  }

  const conn = new Client();

  let wallClockTimer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    wallClockTimer = setTimeout(
      () => reject(new Error("install-agent-timeout: exceeded 5-minute wall-clock limit")),
      timeoutMs
    );
  });

  async function runInstall(): Promise<InstallAgentResult> {
    await new Promise<void>((resolve, reject) => {
      conn
        .on("ready", () => resolve())
        .on("error", (err) => reject(err))
        .connect({
          host: params.host,
          port: params.port,
          username: params.username,
          privateKey: params.privateKey,
          passphrase: params.passphrase,
          readyTimeout: Math.min(timeoutMs, 30_000),
        });
    });

    const tag = await getLatestAgentTag();
    const wrapperScript = buildWrapperScript({
      monitoringMode: params.monitoringMode,
      apiUrl: params.apiUrl,
      serverName: params.serverName,
      tag,
      reportIntervalSeconds: params.reportIntervalSeconds,
    });

    // rotating-key phase is emitted by the route handler before this call
    emitStatus("running-installer", `Fetching and running installer wrapper (tag ${tag}) via bash stdin`);

    return new Promise<InstallAgentResult>((resolve, reject) => {
      // AGENT_API_KEY is set here on the exec-channel env — not in the script body,
      // not on argv. Line 284 below is the single point where the key touches the wire.
      conn.exec("bash -s", { pty: false, env: { AGENT_API_KEY: params.apiKey } }, (err, stream) => {
        if (err) { reject(err); return; }

        const stdoutBuf = makeLineBuffer((line) => emitLog("stdout", line));
        const stderrBuf = makeLineBuffer((line) => emitLog("stderr", line));

        stream
          .on("data", (chunk: Buffer) => stdoutBuf.push(chunk))
          .stderr.on("data", (chunk: Buffer) => stderrBuf.push(chunk));

        stream.on("close", (code: number | null) => {
          stdoutBuf.flush();
          stderrBuf.flush();
          resolve({ ok: code === 0, exitCode: code });
        });

        stream.write(wrapperScript);
        stream.end();
      });
    });
  }

  try {
    const result = await Promise.race([runInstall(), timeoutPromise]);
    emitStatus("done", result.ok ? "Agent installed successfully" : `Installer exited with code ${result.exitCode}`);
    emitDone(result.ok, result.exitCode);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown-error";
    emitError(message);
    emitDone(false, null);
    return { ok: false, exitCode: null };
  } finally {
    clearTimeout(wallClockTimer);
    conn.end();
  }
}
