/**
 * agentInstaller.ts
 *
 * Installs the Edge Monitoring agent on a remote server over SSH by piping
 * the install script via stdin to `bash -s`. No shell command is constructed
 * from untrusted data without escaping — server name is single-quote escaped
 * before being embedded in the argument string.
 *
 * IMPORTANT: The embedded INSTALL_SCRIPT constant below is a verbatim copy of
 * scripts/install-agent.sh at the repo root. The API container does NOT have
 * access to the scripts/ directory at runtime, so the content is embedded here.
 * If you update scripts/install-agent.sh you MUST also update the constant
 * below to keep both in sync.
 */

import { Client } from "ssh2";

// ---------------------------------------------------------------------------
// Embedded install script — must stay in sync with scripts/install-agent.sh
// ---------------------------------------------------------------------------
const INSTALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

# Edge Monitoring Agent — one-liner installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tornikedzidzishvili/edge-monitoring/main/scripts/install-agent.sh | bash -s -- \\
#     --api-url https://monitoring.edge.ge/api \\
#     --api-key YOUR_AGENT_KEY \\
#     --server-name my-server

INSTALL_DIR="/opt/edge-monitoring-agent"
CENTRAL_API_URL=""
AGENT_API_KEY=""
SERVER_NAME=""
REPORT_INTERVAL_SECONDS=30

usage() {
  cat <<EOF
Edge Monitoring Agent Installer

Usage:
  install-agent.sh --api-url URL --api-key KEY --server-name NAME [--interval SECONDS] [--dir PATH]

Required:
  --api-url       Central API URL (e.g. https://monitoring.edge.ge/api)
  --api-key       Agent API key (from the monitoring dashboard)
  --server-name   Display name for this server

Optional:
  --interval      Report interval in seconds (default: 30)
  --dir           Install directory (default: /opt/edge-monitoring-agent)
  -h, --help      Show this help
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url)    CENTRAL_API_URL="$2"; shift 2 ;;
    --api-key)    AGENT_API_KEY="$2"; shift 2 ;;
    --server-name) SERVER_NAME="$2"; shift 2 ;;
    --interval)   REPORT_INTERVAL_SECONDS="$2"; shift 2 ;;
    --dir)        INSTALL_DIR="$2"; shift 2 ;;
    -h|--help)    usage ;;
    *)            echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$CENTRAL_API_URL" || -z "$AGENT_API_KEY" || -z "$SERVER_NAME" ]]; then
  echo "Error: --api-url, --api-key, and --server-name are required."
  echo
  usage
fi

# Check for docker compose
if docker compose version &>/dev/null; then
  DC="docker compose"
elif command -v docker-compose &>/dev/null; then
  DC="docker-compose"
else
  echo "Error: docker compose is required but not installed."
  exit 1
fi

echo "Installing Edge Monitoring Agent..."
echo "  Directory:  $INSTALL_DIR"
echo "  API URL:    $CENTRAL_API_URL"
echo "  Server:     $SERVER_NAME"
echo

mkdir -p "$INSTALL_DIR"

# Write .env
cat > "$INSTALL_DIR/.env" <<EOF
CENTRAL_API_URL=$CENTRAL_API_URL
AGENT_API_KEY=$AGENT_API_KEY
SERVER_NAME=$SERVER_NAME
REPORT_INTERVAL_SECONDS=$REPORT_INTERVAL_SECONDS
EOF
chmod 600 "$INSTALL_DIR/.env"

# Write docker-compose.yml
cat > "$INSTALL_DIR/docker-compose.yml" <<'COMPOSE'
services:
  agent:
    image: ghcr.io/tornikedzidzishvili/edge-monitoring-agent:latest
    container_name: edge-monitoring-agent
    restart: unless-stopped
    environment:
      - CENTRAL_API_URL=\${CENTRAL_API_URL}
      - SERVER_NAME=\${SERVER_NAME}
      - AGENT_API_KEY=\${AGENT_API_KEY}
      - REPORT_INTERVAL_SECONDS=\${REPORT_INTERVAL_SECONDS:-30}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
COMPOSE

# Pull and start
cd "$INSTALL_DIR"
$DC pull
$DC up -d

echo
echo "Agent installed and running."
echo "Logs: cd $INSTALL_DIR && $DC logs -f"
echo
echo "To update later:  cd $INSTALL_DIR && $DC pull && $DC up -d"
echo "To uninstall:     cd $INSTALL_DIR && $DC down && rm -rf $INSTALL_DIR"
`;

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
  /** Plaintext API key — never emitted in log lines (scrubbed by emit wrapper). */
  apiKey: string;
  serverName: string;
  timeoutMs?: number;
};

export type InstallAgentResult = {
  ok: boolean;
  exitCode: number | null;
};

/**
 * Callback invoked once per NDJSON line that the route handler should write
 * to the response stream. Lines are fully-formed JSON strings without a
 * trailing newline — the caller appends "\n".
 */
export type EmitFn = (jsonLine: string) => void;

// ---------------------------------------------------------------------------
// Shell-injection-safe argument escaping
// ---------------------------------------------------------------------------

/**
 * Single-quote escapes a value for safe embedding inside a shell command.
 * Replaces every ' with '\'' so the value can be wrapped in single quotes.
 * This prevents any character in `serverName` (including spaces, semicolons,
 * backticks, dollar signs, etc.) from being interpreted by the remote shell.
 */
function shellSingleQuote(value: string): string {
  // Replace each single-quote with: end-single-quote, escaped single-quote, begin-single-quote
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

// ---------------------------------------------------------------------------
// Line-buffered stream helper
// ---------------------------------------------------------------------------

/**
 * Returns a handler that buffers incoming chunks and calls `onLine` for each
 * complete newline-terminated line. On flush (call with null), emits any
 * remaining partial buffer as a final line.
 */
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
        const line = buf.slice(0, nl).replace(/\r$/, ""); // strip CR for CRLF safety
        buf = buf.slice(nl + 1);
        onLine(line);
      }
    },
    flush() {
      if (buf.length > 0) {
        onLine(buf.replace(/\r$/, ""));
        buf = "";
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Core installer
// ---------------------------------------------------------------------------

/**
 * Connects to a remote server via SSH, rotates its agent API key, and runs
 * the embedded install script by piping it to `bash -s` stdin.
 *
 * The `emit` callback receives fully-formed NDJSON strings (no trailing newline).
 * The `apiKey` is scrubbed from all emitted log lines before calling `emit`.
 *
 * This function is intentionally pure with respect to HTTP streaming and DB
 * writes — those responsibilities belong to the route handler in index.ts.
 */
export async function installAgentOverSsh(
  params: InstallAgentParams,
  emit: EmitFn
): Promise<InstallAgentResult> {
  const timeoutMs = params.timeoutMs ?? 5 * 60 * 1000; // 5-minute wall-clock

  // Scrub the plaintext API key from any line before emitting it, so a noisy
  // installer script that echoes its arguments cannot leak the key into the
  // NDJSON stream that the browser reads.
  function safeEmit(jsonLine: string): void {
    const scrubbed = jsonLine.replaceAll(params.apiKey, "[REDACTED]");
    emit(scrubbed);
  }

  function emitStatus(
    phase: "connecting" | "rotating-key" | "running-installer" | "done",
    message: string
  ): void {
    safeEmit(JSON.stringify({ type: "status", phase, message }));
  }

  function emitLog(stream: "stdout" | "stderr", line: string): void {
    safeEmit(JSON.stringify({ type: "log", stream, line }));
  }

  function emitError(message: string): void {
    // Errors do NOT expose internal details — just the message passed in.
    // Use safeEmit so the API key is scrubbed even from error messages
    // surfaced by the SSH library (e.g., if an auth failure echoes back a
    // command argument that contains the key). Defense in depth.
    safeEmit(JSON.stringify({ type: "error", message }));
  }

  function emitDone(ok: boolean, exitCode: number | null): void {
    safeEmit(JSON.stringify({ type: "done", ok, exitCode }));
  }

  const conn = new Client();

  // Wall-clock timeout: fires regardless of what the SSH session is doing.
  let wallClockTimer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    wallClockTimer = setTimeout(() => {
      reject(new Error("install-agent-timeout: exceeded 5-minute wall-clock limit"));
    }, timeoutMs);
  });

  async function runInstall(): Promise<InstallAgentResult> {
    // Phase "connecting" is emitted by the route handler before calling this
    // function, so we go straight to opening the TCP connection here.
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

    // --- Phase: running-installer ---
    // Note: rotating-key is emitted by the route handler BEFORE calling this
    // function (because the DB write happens there), so we go straight to
    // running-installer here.
    emitStatus(
      "running-installer",
      "Uploading and running install script via bash stdin"
    );

    // Build the remote command. All dynamic values use single-quote escaping to
    // prevent shell injection even if server name contains special characters.
    const escapedApiUrl = shellSingleQuote(params.apiUrl);
    const escapedApiKey = shellSingleQuote(params.apiKey);
    const escapedServerName = shellSingleQuote(params.serverName);

    const remoteCmd =
      `bash -s -- --api-url ${escapedApiUrl} --api-key ${escapedApiKey} --server-name ${escapedServerName}`;

    return new Promise<InstallAgentResult>((resolve, reject) => {
      conn.exec(remoteCmd, { pty: false }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        const stdoutBuf = makeLineBuffer((line) => emitLog("stdout", line));
        const stderrBuf = makeLineBuffer((line) => emitLog("stderr", line));

        stream
          .on("data", (chunk: Buffer) => stdoutBuf.push(chunk))
          .stderr.on("data", (chunk: Buffer) => stderrBuf.push(chunk));

        stream.on("close", (code: number | null) => {
          // Flush any trailing partial lines before closing
          stdoutBuf.flush();
          stderrBuf.flush();

          const ok = code === 0;
          resolve({ ok, exitCode: code });
        });

        // Pipe the install script body into stdin, then signal EOF
        stream.write(INSTALL_SCRIPT);
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
    // Always close the SSH connection — even if timed out or errored.
    conn.end();
  }
}
