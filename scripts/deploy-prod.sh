#!/usr/bin/env sh
set -eu

# Deploy/update Edge Monitoring on a server.
# Assumes:
# - You are logged in as a non-root deploy user
# - Docker + docker compose v2 are installed
# - Repo is either already cloned or can be cloned
#
# Usage:
#   REPO_URL=https://github.com/tornikedzidzishvili/edgemonitoring.git \
#   APP_DIR=/opt/edge-monitoring \
#   SSH_KEY_MASTER_SECRET='<long-random-secret>' \
#   CERTBOT_EMAIL='admin@edge.ge' \
#   ./scripts/deploy-prod.sh

REPO_URL="${REPO_URL:-https://github.com/tornikedzidzishvili/edgemonitoring.git}"
APP_DIR="${APP_DIR:-/opt/edge-monitoring}"
SKIP_GIT="${SKIP_GIT:-0}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose v2 not found" >&2
  exit 1
fi

if [ -z "${SSH_KEY_MASTER_SECRET:-}" ] || [ "${#SSH_KEY_MASTER_SECRET}" -lt 16 ]; then
  echo "ERROR: set SSH_KEY_MASTER_SECRET (min 16 chars)" >&2
  exit 1
fi

mkdir -p "$APP_DIR"

if [ "$SKIP_GIT" = "1" ]; then
  echo "[1/5] Using existing files (SKIP_GIT=1)"
  if [ ! -f "$APP_DIR/docker-compose.prod.yml" ]; then
    echo "ERROR: missing $APP_DIR/docker-compose.prod.yml" >&2
    exit 1
  fi
else
  if [ ! -d "$APP_DIR/.git" ]; then
    echo "[1/5] Cloning repo"
    git clone "$REPO_URL" "$APP_DIR"
  else
    echo "[1/5] Updating repo"
    git -C "$APP_DIR" fetch --all --prune
    git -C "$APP_DIR" reset --hard origin/main
  fi
fi

echo "[2/5] Writing production env file (not committed)"
# docker compose automatically reads .env in the working directory
cat >"$APP_DIR/.env" <<EOF
SSH_KEY_MASTER_SECRET=$SSH_KEY_MASTER_SECRET
EOF

echo "[3/5] Building and starting stack (HTTP proxy initially)"
docker compose -f "$APP_DIR/docker-compose.prod.yml" up -d --build api web proxy

if [ -n "${CERTBOT_EMAIL:-}" ]; then
  echo "[4/5] Requesting Let's Encrypt certificate"
  docker compose -f "$APP_DIR/docker-compose.prod.yml" run --rm certbot certonly \
    --webroot -w /var/www/certbot \
    -d monitoring.edge.ge \
    --email "$CERTBOT_EMAIL" \
    --agree-tos \
    --no-eff-email

  echo "[5/5] Switching proxy to HTTPS"
  echo "Edit $APP_DIR/docker-compose.prod.yml:"
  echo "- Change proxy mount from infra/proxy/nginx.http.conf to infra/proxy/nginx.https.conf"
  echo "Then run: docker compose -f $APP_DIR/docker-compose.prod.yml up -d --no-deps proxy"
else
  echo "[4/5] Skipping cert issuance (CERTBOT_EMAIL not set)"
  echo "To enable TLS later: set CERTBOT_EMAIL and run scripts/install-ssl-monitoring-edge-ge.sh"
fi

echo "Done. Check:"
echo "- docker compose -f $APP_DIR/docker-compose.prod.yml ps"
echo "- curl -fsS http://127.0.0.1/ (on the server)"
