#!/usr/bin/env sh
set -eu

# Deploy/update Edge Monitoring on a server.
# Assumes:
# - You are logged in as a non-root deploy user
# - Docker + docker compose v2 are installed
# - Server can pull from ghcr.io (docker login done beforehand or GHCR_TOKEN set)
#
# Usage:
#   APP_DIR=/opt/edge-monitoring \
#   IMAGE_TAG=sha-abc1234 \
#   SSH_KEY_MASTER_SECRET='<long-random-secret>' \
#   CERTBOT_EMAIL='admin@edge.ge' \
#   ./scripts/deploy-prod.sh

REPO_URL="${REPO_URL:-https://github.com/tornikedzidzishvili/edgemonitoring.git}"
APP_DIR="${APP_DIR:-/opt/edge-monitoring}"
SKIP_GIT="${SKIP_GIT:-0}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_PREFIX="ghcr.io/tornikedzidzishvili/edge-monitoring"

dc() {
  IMAGE_TAG="$IMAGE_TAG" docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" "$@"
}

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

# --- Step 1: Get files ---
if [ "$SKIP_GIT" = "1" ]; then
  echo "[1/6] Using existing files (SKIP_GIT=1)"
  if [ ! -f "$APP_DIR/docker-compose.prod.yml" ]; then
    echo "ERROR: missing $APP_DIR/docker-compose.prod.yml" >&2
    exit 1
  fi
else
  if [ ! -d "$APP_DIR/.git" ]; then
    echo "[1/6] Cloning repo"
    git clone "$REPO_URL" "$APP_DIR"
  else
    echo "[1/6] Updating repo"
    git -C "$APP_DIR" fetch --all --prune
    git -C "$APP_DIR" reset --hard origin/main
  fi
fi

# --- Step 2: Write .env ---
echo "[2/6] Writing production env file (not committed)"
umask 077
cat >"$APP_DIR/.env" <<EOF
SSH_KEY_MASTER_SECRET=$SSH_KEY_MASTER_SECRET
PROXY_CONF=./infra/proxy/nginx.http.conf
IMAGE_TAG=$IMAGE_TAG
EOF
chmod 600 "$APP_DIR/.env" || true

# --- Step 3: Save previous tag for rollback ---
PREV_TAG=""
if [ -f "$APP_DIR/.image-tag" ]; then
  PREV_TAG=$(cat "$APP_DIR/.image-tag")
fi
echo "$IMAGE_TAG" > "$APP_DIR/.image-tag"

# --- Step 4: Pull images and start stack ---
echo "[3/6] Pulling images and starting stack (HTTP proxy initially)"
docker pull "${IMAGE_PREFIX}-api:${IMAGE_TAG}"
docker pull "${IMAGE_PREFIX}-web:${IMAGE_TAG}"
dc up -d --no-build api web proxy

# --- Step 5: Health check ---
echo "[4/6] Running health check..."
HEALTHY=false
for i in 1 2 3 4 5; do
  sleep 10
  if dc exec -T api wget -q --spider http://127.0.0.1:4000/health 2>/dev/null; then
    echo "Health check passed on attempt $i"
    HEALTHY=true
    break
  fi
  echo "Health check attempt $i failed, retrying..."
done

if [ "$HEALTHY" = "false" ]; then
  echo "Health check FAILED after 5 attempts."
  echo "API container logs:"
  dc logs --tail=50 api

  # Rollback
  if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$IMAGE_TAG" ]; then
    echo "Rolling back to $PREV_TAG..."
    IMAGE_TAG="$PREV_TAG"
    dc up -d --no-build api web
    echo "$PREV_TAG" > "$APP_DIR/.image-tag"
    sleep 15
    if dc exec -T api wget -q --spider http://127.0.0.1:4000/health 2>/dev/null; then
      echo "Rollback successful, previous version is healthy."
    else
      echo "WARNING: Rollback health check also failed!"
    fi
  fi
  exit 1
fi

# --- Step 6: SSL setup ---
if [ -n "${CERTBOT_EMAIL:-}" ]; then
  echo "[5/6] Requesting/renewing Let's Encrypt certificate"
  dc run --rm certbot certonly \
    --webroot -w /var/www/certbot \
    -d monitoring.edge.ge \
    --email "$CERTBOT_EMAIL" \
    --agree-tos \
    --no-eff-email \
    --keep-until-expiring

  # Set up auto-renewal cron job (runs twice daily, only renews if needed)
  CRON_CMD="0 0,12 * * * docker compose --project-directory $APP_DIR -f $APP_DIR/docker-compose.prod.yml run --rm certbot renew --quiet && docker compose --project-directory $APP_DIR -f $APP_DIR/docker-compose.prod.yml exec -T proxy nginx -s reload"
  if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    echo "[5b/6] Setting up auto-renewal cron job"
    (crontab -l 2>/dev/null || true; echo "$CRON_CMD") | crontab -
  fi

  echo "[6/6] Switching proxy to HTTPS"
  if grep -q '^PROXY_CONF=' "$APP_DIR/.env"; then
    sed -i "s|^PROXY_CONF=.*$|PROXY_CONF=./infra/proxy/nginx.https.conf|" "$APP_DIR/.env"
  else
    printf '\nPROXY_CONF=./infra/proxy/nginx.https.conf\n' >>"$APP_DIR/.env"
  fi
  chmod 600 "$APP_DIR/.env" || true
  dc up -d --no-deps proxy
  dc exec -T proxy nginx -s reload || true
else
  echo "[5/6] Skipping cert issuance (CERTBOT_EMAIL not set)"
  echo "To enable TLS later: set CERTBOT_EMAIL and run scripts/install-ssl-monitoring-edge-ge.sh"
fi

# --- Cleanup ---
echo "Pruning old images..."
docker image prune -f || true

echo "Done. Deployed IMAGE_TAG=$IMAGE_TAG"
echo "Check:"
echo "- docker compose --project-directory $APP_DIR -f $APP_DIR/docker-compose.prod.yml ps"
echo "- curl -fsS http://127.0.0.1/ (on the server)"
