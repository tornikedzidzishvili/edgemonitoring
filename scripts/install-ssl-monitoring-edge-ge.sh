#!/usr/bin/env sh
set -eu

DOMAIN="monitoring.edge.ge"
EMAIL="${CERTBOT_EMAIL:-}"

if [ -z "$EMAIL" ]; then
  echo "ERROR: set CERTBOT_EMAIL (used by Let's Encrypt)" >&2
  echo "Example: CERTBOT_EMAIL=admin@edge.ge ./scripts/install-ssl-monitoring-edge-ge.sh" >&2
  exit 1
fi

echo "[1/3] Starting production stack (HTTP only)"
docker compose -f docker-compose.prod.yml up -d --build api web proxy

echo "[2/3] Requesting Let's Encrypt certificate for $DOMAIN"
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email

echo "[3/3] Enable HTTPS config"
echo "- Edit docker-compose.prod.yml to mount infra/proxy/nginx.https.conf instead of infra/proxy/nginx.http.conf"
echo "- Then run: docker compose -f docker-compose.prod.yml up -d --no-deps proxy"
