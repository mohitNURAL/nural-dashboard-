#!/usr/bin/env bash
# Updates the live server in place (the DigitalOcean droplet: a git clone run by PM2, web served
# by nginx from apps/web/dist, the API on port 4000 behind it). Run on the server from the clone:
#   cd ~/mohit/nural && git pull --ff-only && bash scripts/server-update.sh
# CI (.github/workflows/ci.yml) runs the same over SSH after the checks pass. The root .env stays
# on the server; nothing here prints it.
set -euo pipefail
cd "$(dirname "$0")/.."

PM2_APP=${PM2_APP:-pulse-api}
if command -v pnpm >/dev/null; then PNPM=(pnpm); else PNPM=(npx -y pnpm@9.15.9); fi

echo "Updating to $(git log --oneline -1)"
"${PNPM[@]}" install --frozen-lockfile
"${PNPM[@]}" --filter @nural/web build
"${PNPM[@]}" db:migrate
pm2 restart "$PM2_APP" --update-env
pm2 save >/dev/null
# Deadline history for the Tasks in hand planner (SRS 25): read-only from Bitrix24 and resumable,
# so after the first run it only reads tasks added since. A failure never fails the deploy; it
# picks up where it stopped on the next one.
"${PNPM[@]}" sync:deadlines || echo "Warning: deadline history not finished (re-runs next deploy)."
echo "Done: web rebuilt, migrations applied, $PM2_APP restarted, deadline history read."
