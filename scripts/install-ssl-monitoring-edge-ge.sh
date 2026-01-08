#!/usr/bin/env sh
set -eu

DOMAIN="monitoring.edge.ge"
EMAIL="${CERTBOT_EMAIL:-}"
APP_DIR="${APP_DIR:-$(pwd)}"

dc() {
  docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" "$@"
}

if [ -z "$EMAIL" ]; then
  echo "ERROR: set CERTBOT_EMAIL (used by Let's Encrypt)" >&2
  echo "Example: CERTBOT_EMAIL=admin@edge.ge ./scripts/install-ssl-monitoring-edge-ge.sh" >&2
  exit 1
fi

echo "[1/3] Starting production stack (HTTP only)"
umask 077
if [ -f "$APP_DIR/.env" ]; then
  if grep -q '^PROXY_CONF=' "$APP_DIR/.env"; then
    sed -i "s|^PROXY_CONF=.*$|PROXY_CONF=./infra/proxy/nginx.http.conf|" "$APP_DIR/.env"
  else
    printf '\nPROXY_CONF=./infra/proxy/nginx.http.conf\n' >>"$APP_DIR/.env"
  fi
else
  printf 'PROXY_CONF=./infra/proxy/nginx.http.conf\n' >"$APP_DIR/.env"
fi
chmod 600 "$APP_DIR/.env" || true

dc up -d --build api web proxy

echo "[2/3] Requesting Let's Encrypt certificate for $DOMAIN"
dc run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email

echo "[3/3] Enable HTTPS config"
if grep -q '^PROXY_CONF=' "$APP_DIR/.env"; then
  sed -i "s|^PROXY_CONF=.*$|PROXY_CONF=./infra/proxy/nginx.https.conf|" "$APP_DIR/.env"
else
  printf '\nPROXY_CONF=./infra/proxy/nginx.https.conf\n' >>"$APP_DIR/.env"
fi
chmod 600 "$APP_DIR/.env" || true
dc up -d --no-deps proxy
dc exec -T proxy nginx -s reload || true
