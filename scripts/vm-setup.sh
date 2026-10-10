#!/usr/bin/env bash
# One-time setup of a fresh Oracle Cloud Ubuntu VM (SRS 10.5, milestone 9). Run from Git Bash:
#   ssh -i ~/.ssh/nural_oracle ubuntu@<ip> 'bash -s' < scripts/vm-setup.sh
set -euo pipefail

# Docker Engine and the compose plugin (official convenience script).
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# Oracle's Ubuntu image rejects everything but SSH in iptables, on top of the cloud security list.
if ! sudo iptables -C INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
  sudo iptables -I INPUT -p udp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
fi

# Swap, so image builds never run out of memory on small shapes.
if ! swapon --show | grep -q swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

mkdir -p ~/nural/caddy-extra
echo "VM ready: $(docker --version 2>/dev/null || echo 'docker installed, log in again for group')"
