#!/usr/bin/env bash
# Deploys the committed code to the server and (re)starts it (SRS 10.5, milestone 9). From Git Bash:
#   DEPLOY_HOST=root@<ip> scripts/deploy.sh
# Ships `git archive HEAD` (committed code only) and .env.prod as the server's .env; the server
# never needs GitHub access. .env.prod stays on this machine and is never committed.
# CI (.github/workflows/ci.yml) runs it with KEEP_ENV=1: the server keeps the .env it has.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=${DEPLOY_HOST:?set DEPLOY_HOST, e.g. DEPLOY_HOST=root@203.0.113.10}
KEY=${DEPLOY_KEY:-$HOME/.ssh/nural_oracle}
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")

KEEP_ENV=${KEEP_ENV:-}
[ -n "$KEEP_ENV" ] || [ -f .env.prod ] || { echo ".env.prod is missing (copy .env.example and fill it in)"; exit 1; }
git diff --quiet HEAD || echo "Note: uncommitted changes are not deployed."

echo "Shipping $(git rev-parse --short HEAD) to $HOST"
git archive --format=tar HEAD | "${SSH[@]}" 'mkdir -p ~/nural/caddy-extra && tar -x -C ~/nural'
if [ -n "$KEEP_ENV" ]; then
  "${SSH[@]}" 'test -f ~/nural/.env' || { echo "The server has no ~/nural/.env; run a first deploy from a laptop with .env.prod"; exit 1; }
else
  scp -q -i "$KEY" .env.prod "$HOST:nural/.env"
fi
"${SSH[@]}" 'chmod 600 ~/nural/.env && cd ~/nural &&
  docker compose -f docker-compose.prod.yml up -d --build --remove-orphans &&
  docker image prune -f >/dev/null &&
  docker compose -f docker-compose.prod.yml ps'
