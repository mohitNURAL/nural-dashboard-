#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server for the Docker setup (SRS 10.5, milestone 9).
# Log in as root (or ubuntu on Oracle Cloud). Run from Git Bash:
#   ssh -i <ssh key> root@<ip> 'bash -s' < scripts/vm-setup.sh
set -euo pipefail

# Docker Engine and the compose plugin (official convenience script).
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# Oracle's Ubuntu image rejects everything but SSH in iptables (saved by netfilter-persistent);
# most other providers leave the ports open, so this only runs where that tool exists.
if command -v netfilter-persistent >/dev/null &&
  ! sudo iptables -C INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
  sudo iptables -I INPUT -p udp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
fi

# If ufw is on, allow SSH and the web ports.
if command -v ufw >/dev/null && sudo ufw status | grep -q 'Status: active'; then
  sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp
fi

# Swap, so image builds never run out of memory on small servers.
if ! swapon --show | grep -q swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

mkdir -p ~/nural/caddy-extra
echo "VM ready: $(docker --version 2>/dev/null || echo 'docker installed, log in again for group')"
