#!/usr/bin/env sh
set -eu

# Secure bootstrap for an Ubuntu/Debian server.
# - Creates a non-root user for deployments
# - Locks down SSH to key-only auth
# - Enables firewall + fail2ban
# - Prepares Docker access for the deploy user
#
# Usage (as root on the server):
#   DEPLOY_USER=edge DOMAIN=monitoring.edge.ge ./scripts/bootstrap-ubuntu.sh

DEPLOY_USER="${DEPLOY_USER:-edge}"
DOMAIN="${DOMAIN:-monitoring.edge.ge}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run as root" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "ERROR: this script expects apt-get (Ubuntu/Debian)" >&2
  exit 1
fi

echo "[1/8] Installing baseline packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git openssh-server ufw fail2ban

echo "[2/8] Creating deploy user: $DEPLOY_USER"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi

# Ensure .ssh dir exists with correct perms
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

echo "[3/8] Preparing Docker permissions"
# Docker CE is already installed per user; ensure group exists and user is in it.
if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "$DEPLOY_USER"
fi

echo "[4/8] Hardening SSH (key-only, no root login)"
SSHD_DROPIN_DIR=/etc/ssh/sshd_config.d
install -d -m 755 "$SSHD_DROPIN_DIR"
cat >"$SSHD_DROPIN_DIR/99-edge-monitoring-hardening.conf" <<EOF
# Edge Monitoring hardening
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
# Reduce attack surface
X11Forwarding no
AllowTcpForwarding no
PermitTunnel no
# Only allow the deploy user
AllowUsers $DEPLOY_USER
EOF

# Validate sshd config before restart
sshd -t
systemctl restart ssh

echo "[5/8] Enabling UFW firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[6/8] Enabling fail2ban"
systemctl enable --now fail2ban

echo "[7/8] Creating app directory"
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /opt/edge-monitoring

echo "[8/8] Done"
echo "Next steps:"
echo "- Add your SSH public key to /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "- From your machine: ssh -i ~/.ssh/id_ed25519 $DEPLOY_USER@<server-ip>"
echo "- Deploy with scripts/deploy-prod.sh (run as $DEPLOY_USER)"
