#!/usr/bin/env bash
set -euo pipefail

# Edge Monitoring Agent — systemd (non-Docker) installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tornikedzidzishvili/edgemonitoring/main/scripts/install-agent-systemd.sh | sudo bash -s -- \
#     --api-url https://monitoring.edge.ge/api \
#     --api-key YOUR_AGENT_KEY \
#     --server-name my-server
#
# This is the systemd companion to scripts/install-agent.sh (which uses Docker).
# Use this on hosts where Docker is not desired or not available — CyberPanel,
# Plesk, plain VPS, etc.
#
# Supported distros: Ubuntu 18.04+, Debian 10+ (any glibc systemd-based distro).
# Alpine is NOT supported — it ships musl + OpenRC, no systemd.
#
# Node.js 22 is installed via NodeSource's official setup script
# (curl -fsSL https://deb.nodesource.com/setup_22.x | bash -). Some hardened
# environments block this pattern; in that case install nodejs >= 22 manually
# before running this script. We deliberately do NOT use nvm (user-scoped,
# breaks systemd) or static binaries (no auto-update path).
#
# NOTE: This file is the standalone copy of the systemd installer. There is no
# embedded copy in apps/api/src/agentInstaller.ts at the time of writing — that
# file only embeds the Docker installer. If a systemd embed is added later,
# both copies MUST be kept in sync.

INSTALL_DIR="/opt/edge-monitoring-agent"
CENTRAL_API_URL=""
AGENT_API_KEY=""
SERVER_NAME=""
REPORT_INTERVAL_SECONDS=30

# Source archive for the agent code. Pinned to main branch tarball; we'll move
# to versioned GitHub Releases (Approach A in EMS-39) once the project starts
# cutting them.
AGENT_SOURCE_TARBALL="https://github.com/tornikedzidzishvili/edgemonitoring/archive/refs/heads/main.tar.gz"
AGENT_SOURCE_SUBDIR="edgemonitoring-main"

SERVICE_NAME="edge-monitoring-agent"
SERVICE_USER="edge-agent"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

usage() {
  cat <<EOF
Edge Monitoring Agent — systemd Installer

Usage:
  install-agent-systemd.sh --api-url URL --api-key KEY --server-name NAME [--interval SECONDS] [--dir PATH]

Required:
  --api-url           Central API URL (e.g. https://monitoring.edge.ge/api)
  --api-key           Agent API key (from the monitoring dashboard)
  --server-name       Display name for this server

Optional:
  --interval          Report interval in seconds (default: 30)
  --dir               Install directory (default: /opt/edge-monitoring-agent)
  -h, --help          Show this help
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url)     CENTRAL_API_URL="$2"; shift 2 ;;
    --api-key)     AGENT_API_KEY="$2"; shift 2 ;;
    --server-name) SERVER_NAME="$2"; shift 2 ;;
    --interval)    REPORT_INTERVAL_SECONDS="$2"; shift 2 ;;
    --dir)         INSTALL_DIR="$2"; shift 2 ;;
    -h|--help)     usage ;;
    *)             echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$CENTRAL_API_URL" || -z "$AGENT_API_KEY" || -z "$SERVER_NAME" ]]; then
  echo "Error: --api-url, --api-key, and --server-name are required."
  echo
  usage
fi

# ─── Preflight ──────────────────────────────────────────────────────────────

# Pick a privilege wrapper so the rest of the script can prefix system writes
# with "$SUDO" regardless of whether the caller is root or a sudoer.
SUDO=""
if [[ $EUID -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "Error: this script must be run as root or via sudo." >&2
    exit 1
  fi
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "Error: systemd is required (Alpine/OpenRC not supported)." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required to bootstrap NodeSource and fetch the agent source." >&2
  exit 1
fi

# Tar is needed to extract the agent tarball. It's preinstalled on every
# supported distro but we still check to avoid an obscure pipe failure later.
if ! command -v tar >/dev/null 2>&1; then
  echo "Error: tar is required." >&2
  exit 1
fi

echo "Installing Edge Monitoring Agent (systemd)..."
echo "  Directory:  $INSTALL_DIR"
echo "  API URL:    $CENTRAL_API_URL"
echo "  Server:     $SERVER_NAME"
echo "  Interval:   ${REPORT_INTERVAL_SECONDS}s"
echo

# ─── Install Node.js 22 ─────────────────────────────────────────────────────

need_node=1
if command -v node >/dev/null 2>&1; then
  if node --version | grep -qE '^v(22|2[3-9])\.'; then
    need_node=0
    echo "Node.js detected: $(node --version)"
  else
    echo "Existing Node.js is too old: $(node --version) — installing Node 22 from NodeSource..."
  fi
fi

if [[ "$need_node" -eq 1 ]]; then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Error: this installer only supports apt-based distros (Ubuntu/Debian)." >&2
    echo "Install Node.js 22 manually and re-run." >&2
    exit 1
  fi
  echo "Bootstrapping NodeSource Node 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi

# ─── Fetch and build agent source ───────────────────────────────────────────

# Use a temp dir for the tarball extraction so a partially-fetched archive
# never lands in $INSTALL_DIR. The trap fires on normal exit AND error exit.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching agent source..."
curl -fsSL "$AGENT_SOURCE_TARBALL" | tar -xz -C "$TMP"

if [[ ! -d "$TMP/$AGENT_SOURCE_SUBDIR/apps/agent" ]]; then
  echo "Error: tarball did not contain apps/agent — the repo layout may have changed." >&2
  exit 1
fi

# Confirm the agent's package.json exposes the build script we depend on.
# This is the precondition called out in EMS-39: if the agent codebase stops
# producing dist/index.js, this installer must fail loudly rather than silently
# install a broken service.
if ! grep -q '"build"' "$TMP/$AGENT_SOURCE_SUBDIR/apps/agent/package.json"; then
  echo "Error: apps/agent/package.json has no 'build' script. Agent codebase precondition broken." >&2
  exit 1
fi

# Ensure the install dir exists with the right ownership before we lay code
# down. If a previous install left a service running, stop it first so we can
# rewrite files without "text file busy" errors on the running node process.
if systemctl list-unit-files | grep -q "^${SERVICE_NAME}\.service"; then
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "Existing service is running — stopping for redeploy..."
    $SUDO systemctl stop "$SERVICE_NAME"
  fi
fi

$SUDO mkdir -p "$INSTALL_DIR"
$SUDO cp -r "$TMP/$AGENT_SOURCE_SUBDIR/apps/agent/." "$INSTALL_DIR/"

# The agent's tsconfig.json extends ../../tsconfig.base.json (a monorepo path).
# When extracted standalone we don't have that parent layout, so copy the base
# config into the install dir and patch the extends path to be local.
$SUDO cp "$TMP/$AGENT_SOURCE_SUBDIR/tsconfig.base.json" "$INSTALL_DIR/tsconfig.base.json"
$SUDO sed -i 's|"extends": "\.\./\.\./tsconfig\.base\.json"|"extends": "./tsconfig.base.json"|' "$INSTALL_DIR/tsconfig.json"

# Drop any node_modules/dist that may have been bundled in the tarball — we
# rebuild from source below to ensure the host's Node 22 ABI is the one used.
$SUDO rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/dist"

echo "Installing dependencies and building..."
# `npm ci` requires a co-located package-lock.json. The repo uses npm
# workspaces, so the lockfile lives at the repo root, not in apps/agent. We
# therefore use `npm install` here (full install incl. dev deps for the build),
# then `npm prune --omit=dev` after the build to drop typescript/tsx/@types.
( cd "$INSTALL_DIR" && $SUDO npm install --no-audit --no-fund )
( cd "$INSTALL_DIR" && $SUDO npm run build )

if [[ ! -f "$INSTALL_DIR/dist/index.js" ]]; then
  echo "Error: build did not produce dist/index.js. Aborting." >&2
  exit 1
fi

( cd "$INSTALL_DIR" && $SUDO npm prune --omit=dev --no-audit --no-fund )

# ─── Write .env (mode 600, owned by service user later) ─────────────────────

# Use a heredoc into a tmp file then atomically move it into place, so we
# never expose the file with default 644 perms even momentarily.
ENV_TMP="$(mktemp)"
chmod 600 "$ENV_TMP"
cat > "$ENV_TMP" <<EOF
CENTRAL_API_URL=$CENTRAL_API_URL
AGENT_API_KEY=$AGENT_API_KEY
SERVER_NAME=$SERVER_NAME
REPORT_INTERVAL_SECONDS=$REPORT_INTERVAL_SECONDS
EOF
$SUDO mv "$ENV_TMP" "$INSTALL_DIR/.env"
$SUDO chmod 600 "$INSTALL_DIR/.env"

# ─── Create system user and own the install dir ─────────────────────────────

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Creating system user: $SERVICE_USER"
  $SUDO useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
$SUDO chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"
# .env should be readable only by the service user even if INSTALL_DIR perms
# loosen for some reason — re-assert 600 after the chown.
$SUDO chmod 600 "$INSTALL_DIR/.env"

# ─── Write systemd unit ─────────────────────────────────────────────────────

# Resolve node's absolute path so the unit doesn't depend on $PATH at boot.
NODE_BIN="$(command -v node)"

UNIT_TMP="$(mktemp)"
cat > "$UNIT_TMP" <<EOF
[Unit]
Description=Edge Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${NODE_BIN} ${INSTALL_DIR}/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
$SUDO mv "$UNIT_TMP" "$UNIT_PATH"
$SUDO chmod 644 "$UNIT_PATH"

# ─── Enable + start ─────────────────────────────────────────────────────────

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$SERVICE_NAME"

# Brief readiness check — give systemd a couple of seconds to actually start
# the process before we report success. If the unit is already in 'failed'
# state we want to surface that, not claim a clean install.
sleep 2
if ! $SUDO systemctl is-active --quiet "$SERVICE_NAME"; then
  echo
  echo "Error: ${SERVICE_NAME} failed to start. Recent logs:" >&2
  $SUDO journalctl -u "$SERVICE_NAME" -n 30 --no-pager >&2 || true
  exit 1
fi

# ─── Final output ───────────────────────────────────────────────────────────

cat <<EOF

Agent installed and running as systemd service: ${SERVICE_NAME}
Logs:    journalctl -u ${SERVICE_NAME} -f
Status:  systemctl status ${SERVICE_NAME}

To uninstall: systemctl disable --now ${SERVICE_NAME} && rm -f ${UNIT_PATH} && rm -rf ${INSTALL_DIR} && systemctl daemon-reload
EOF
