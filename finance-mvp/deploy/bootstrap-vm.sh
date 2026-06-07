#!/usr/bin/env bash
# ============================================================
#  bootstrap-vm.sh — one-time hardening + Docker install for a fresh
#  Ubuntu 22.04/24.04 VM (Oracle Always Free ARM or Hetzner).
#  Run as root on the new box:   bash bootstrap-vm.sh <deploy-username>
#
#  Idempotent-ish: safe to re-run. After it finishes, log in as the
#  new deploy user and run deploy.sh.
# ============================================================
set -euo pipefail

DEPLOY_USER="${1:-deploy}"

echo "==> Updating base system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

echo "==> Installing essentials (ufw, fail2ban, unattended-upgrades, git, curl)"
apt-get install -y ca-certificates curl gnupg git ufw fail2ban unattended-upgrades

echo "==> Creating deploy user '$DEPLOY_USER' (sudo, docker)"
if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"

# Copy root's authorized SSH keys to the deploy user so you can log in as them
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
    /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

echo "==> Hardening SSH (no root login, no passwords)"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd || true

echo "==> Firewall: allow SSH + HTTP + HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Enabling automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "==> Installing Docker Engine + compose plugin"
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker "$DEPLOY_USER"
systemctl enable --now docker

echo "==> Done."
echo "    Next: 'ssh ${DEPLOY_USER}@<vm-ip>' then run deploy.sh."
echo "    Verify: docker --version && docker compose version"
