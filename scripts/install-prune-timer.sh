#!/usr/bin/env sh
set -eu

# EMS-54: install the weekly Docker prune systemd timer on the Edge Monitoring host.
#
# Idempotent — safe to re-run. Pulls source-of-truth unit files from
# scripts/host/ and links them into /etc/systemd/system, then enables the
# timer. To uninstall, pass --uninstall.
#
# Run on the prod host as root:
#   sudo ./scripts/install-prune-timer.sh
#   sudo ./scripts/install-prune-timer.sh --uninstall
#
# Why systemd timer over cron:
# - Persistent=true catches up missed runs after host downtime (cron silently
#   skips them).
# - journalctl -u edge-monitoring-docker-prune.service gives us a per-run
#   structured log without scraping mail or stdout.
# - We avoid mutating crontab, which deploy-prod.sh already manages for the
#   certbot renewal — fewer cross-tool conflicts.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/host"
DEST_DIR="/etc/systemd/system"
SERVICE_NAME="edge-monitoring-docker-prune.service"
TIMER_NAME="edge-monitoring-docker-prune.timer"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must run as root (need to write under /etc/systemd/system)" >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl not found — is this a systemd host?" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found — install Docker before running this script" >&2
  exit 1
fi

if [ "${1:-}" = "--uninstall" ]; then
  echo "[1/3] Disabling and stopping timer"
  systemctl disable --now "$TIMER_NAME" 2>/dev/null || true
  echo "[2/3] Removing unit files"
  rm -f "$DEST_DIR/$TIMER_NAME" "$DEST_DIR/$SERVICE_NAME"
  echo "[3/3] Reloading systemd"
  systemctl daemon-reload
  echo "Uninstalled."
  exit 0
fi

if [ ! -f "$SRC_DIR/$SERVICE_NAME" ] || [ ! -f "$SRC_DIR/$TIMER_NAME" ]; then
  echo "ERROR: missing unit files in $SRC_DIR" >&2
  exit 1
fi

echo "[1/4] Installing unit files into $DEST_DIR"
install -m 644 "$SRC_DIR/$SERVICE_NAME" "$DEST_DIR/$SERVICE_NAME"
install -m 644 "$SRC_DIR/$TIMER_NAME" "$DEST_DIR/$TIMER_NAME"

echo "[2/4] Reloading systemd"
systemctl daemon-reload

echo "[3/4] Enabling and starting the timer"
systemctl enable --now "$TIMER_NAME"

echo "[4/4] Status:"
systemctl status "$TIMER_NAME" --no-pager || true
echo
echo "Next scheduled run:"
systemctl list-timers "$TIMER_NAME" --no-pager || true
echo
echo "Done. To trigger a one-off prune now:"
echo "  sudo systemctl start $SERVICE_NAME"
echo "To watch it run:"
echo "  sudo journalctl -u $SERVICE_NAME -f"
