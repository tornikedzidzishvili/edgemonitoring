#!/usr/bin/env bash
set -euo pipefail

# Edge Monitoring Agent — one-liner installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tornikedzidzishvili/edge-monitoring/main/scripts/install-agent.sh | bash -s -- \
#     --api-url https://monitoring.edge.ge/api \
#     --api-key YOUR_AGENT_KEY \
#     --server-name my-server
#
# Optional registry login (for private images):
#   --registry-url      Registry hostname (default: ghcr.io)
#   --registry-username Registry username
#   REGISTRY_TOKEN env var must be set when using registry auth
#
# NOTE: This file is the standalone copy of the installer. The API embeds an
# identical copy in apps/api/src/agentInstaller.ts. Both copies MUST be kept
# in sync — if you change one, change the other.

# REGISTRY_TOKEN_INJECTION_POINT
REGISTRY_TOKEN="${REGISTRY_TOKEN:-}"

INSTALL_DIR="/opt/edge-monitoring-agent"
CENTRAL_API_URL=""
AGENT_API_KEY=""
SERVER_NAME=""
REPORT_INTERVAL_SECONDS=30
REGISTRY_URL=""
REGISTRY_USERNAME=""

usage() {
  cat <<EOF
Edge Monitoring Agent Installer

Usage:
  install-agent.sh --api-url URL --api-key KEY --server-name NAME [--interval SECONDS] [--dir PATH]

Required:
  --api-url           Central API URL (e.g. https://monitoring.edge.ge/api)
  --api-key           Agent API key (from the monitoring dashboard)
  --server-name       Display name for this server

Optional:
  --interval          Report interval in seconds (default: 30)
  --dir               Install directory (default: /opt/edge-monitoring-agent)
  --registry-url      Container registry hostname (default: ghcr.io)
  --registry-username Registry login username (requires REGISTRY_TOKEN env var)
  -h, --help          Show this help
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url)           CENTRAL_API_URL="$2"; shift 2 ;;
    --api-key)           AGENT_API_KEY="$2"; shift 2 ;;
    --server-name)       SERVER_NAME="$2"; shift 2 ;;
    --interval)          REPORT_INTERVAL_SECONDS="$2"; shift 2 ;;
    --dir)               INSTALL_DIR="$2"; shift 2 ;;
    --registry-url)      REGISTRY_URL="$2"; shift 2 ;;
    --registry-username) REGISTRY_USERNAME="$2"; shift 2 ;;
    -h|--help)           usage ;;
    *)                   echo "Unknown option: $1"; usage ;;
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
  cat <<'EOF' >&2
Error: Docker is not installed on this host.

To monitor this server without Docker, switch the server's
Monitoring Mode in the Edge Monitoring dashboard to either:
  - Linux Server (SSH)        — agentless polling, no install required
  - Linux Agent (systemd)     — push-based, native install (coming soon)

For Docker hosts, install Docker first: https://get.docker.com
EOF
  exit 1
fi

echo "Installing Edge Monitoring Agent..."
echo "  Directory:  $INSTALL_DIR"
echo "  API URL:    $CENTRAL_API_URL"
echo "  Server:     $SERVER_NAME"
echo

# Registry login — only when all three values are present.
# Token is injected into the script body (not argv) to prevent ps-ef exposure.
# Logout runs unconditionally after install so creds don't persist on the host.
REGISTRY_LOGGED_IN=0
if [[ -n "${REGISTRY_URL:-}" && -n "${REGISTRY_USERNAME:-}" && -n "${REGISTRY_TOKEN:-}" ]]; then
  echo "Logging into ${REGISTRY_URL} as ${REGISTRY_USERNAME}..."
  echo "$REGISTRY_TOKEN" | docker login "$REGISTRY_URL" -u "$REGISTRY_USERNAME" --password-stdin
  REGISTRY_LOGGED_IN=1
fi

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
      - CENTRAL_API_URL=${CENTRAL_API_URL}
      - SERVER_NAME=${SERVER_NAME}
      - AGENT_API_KEY=${AGENT_API_KEY}
      - REPORT_INTERVAL_SECONDS=${REPORT_INTERVAL_SECONDS:-30}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
COMPOSE

# Pull and start
cd "$INSTALL_DIR"
$DC pull
$DC up -d

# Revoke registry credentials immediately after pulling so they don't persist
# in /root/.docker/config.json on the customer host.
if [[ "${REGISTRY_LOGGED_IN:-0}" == "1" ]]; then
  echo "Logging out of ${REGISTRY_URL}..."
  docker logout "$REGISTRY_URL" || true
fi

echo
echo "Agent installed and running."
echo "Logs: cd $INSTALL_DIR && $DC logs -f"
echo
echo "To update later:  cd $INSTALL_DIR && $DC pull && $DC up -d"
echo "To uninstall:     cd $INSTALL_DIR && $DC down && rm -rf $INSTALL_DIR"
