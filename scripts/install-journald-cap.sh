#!/usr/bin/env sh
set -eu

# EMS-54: install the journald disk-usage cap on the Edge Monitoring host.
#
# Idempotent — safe to re-run. Drops a managed config file at
# /etc/systemd/journald.conf.d/edge-monitoring.conf and reloads journald.
#
# Run on the prod host as root:
#   sudo ./scripts/install-journald-cap.sh
#
# Why this exists as a one-shot host script (not part of compose):
# journald is a host-level service, not a container. The cap has to be applied
# on the underlying systemd, so it can't ride the GitHub Actions deploy
# pipeline that only redeploys containers. Commit the source-of-truth conf
# under scripts/host/ so the host config is reproducible from git.

SRC_CONF="$(dirname "$0")/host/journald-edge-monitoring.conf"
DEST_DIR="/etc/systemd/journald.conf.d"
DEST_CONF="$DEST_DIR/edge-monitoring.conf"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must run as root (need to write under /etc/systemd)" >&2
  exit 1
fi

if [ ! -f "$SRC_CONF" ]; then
  echo "ERROR: source config not found at $SRC_CONF" >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl not found — is this a systemd host?" >&2
  exit 1
fi

echo "[1/4] Installing $DEST_CONF"
install -d -m 755 "$DEST_DIR"
install -m 644 "$SRC_CONF" "$DEST_CONF"

echo "[2/4] Restarting systemd-journald to apply the cap"
systemctl restart systemd-journald

echo "[3/4] Vacuuming existing journal to enforce the new size cap"
# Vacuum to the same size as the SystemMaxUse so the next boot doesn't carry
# a multi-GB backlog. Read the cap straight from the conf so we never drift.
SIZE_CAP="$(awk -F= '/^[[:space:]]*SystemMaxUse[[:space:]]*=/{gsub(/[[:space:]]/, "", $2); print $2; exit}' "$DEST_CONF")"
if [ -z "${SIZE_CAP:-}" ]; then
  SIZE_CAP="500M"
fi
journalctl --vacuum-size="$SIZE_CAP" >/dev/null

echo "[4/4] Verifying journal disk usage"
journalctl --disk-usage

echo "Done. journald disk usage is now capped (see SystemMaxUse in $DEST_CONF)."
