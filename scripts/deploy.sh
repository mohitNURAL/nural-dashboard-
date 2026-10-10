#!/usr/bin/env bash
# Deploys the committed code to the server and (re)starts it (SRS 10.5, milestone 9). From Git Bash:
#   DEPLOY_HOST=root@<ip> scripts/deploy.sh
# Ships `git archive HEAD` (committed code only) and .env.prod as the server's .env; the server
# never needs GitHub access. .env.prod stays on this machine and is never committed.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=${DEPLOY_HOST:?set DEPLOY_HOST, e.g. DEPLOY_HOST=root@203.0.113.10 (Hetzner) or ubuntu@<ip> (Oracle)}
KEY=${DEPLOY_KEY:-$HOME/.ssh/nural_oracle}
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")

[ -f .env.prod ] || { echo ".env.prod is missing (copy .env.example and fill it in)"; exit 1; }
git diff --quiet HEAD || echo "Note: uncommitted changes are not deployed."

echo "Shipping $(git rev-parse --short HEAD) to $HOST"
git archive --format=tar HEAD | "${SSH[@]}" 'mkdir -p ~/nural/caddy-extra && tar -x -C ~/nural'
scp -q -i "$KEY" .env.prod "$HOST:nural/.env"
"${SSH[@]}" 'chmod 600 ~/nural/.env && cd ~/nural &&
  docker compose -f docker-compose.prod.yml up -d --build --remove-orphans &&
  docker image prune -f >/dev/null &&
  docker compose -f docker-compose.prod.yml ps'
