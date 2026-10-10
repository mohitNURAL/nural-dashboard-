#!/usr/bin/env bash
# Copies the local Postgres (port 5433 container) to the server, so stage history and the backfill
# carry over; the reconcile then catches up. Run once after the first deploy:
#   DEPLOY_HOST=root@<ip> scripts/db-copy.sh
set -euo pipefail
HOST=${DEPLOY_HOST:?set DEPLOY_HOST}
KEY=${DEPLOY_KEY:-$HOME/.ssh/nural_oracle}
SSH=(ssh -i "$KEY" "$HOST")
DUMP=$(mktemp)

docker exec nural-dashboard-postgres-1 pg_dump -U dash -d dash -Fc --no-owner > "$DUMP"
echo "Dump: $(du -h "$DUMP" | cut -f1)"
scp -q -i "$KEY" "$DUMP" "$HOST:nural/dash.dump"
rm -f "$DUMP"
"${SSH[@]}" 'cd ~/nural && C="docker compose -f docker-compose.prod.yml" &&
  $C stop api &&
  $C exec -T postgres pg_restore -U dash -d dash --clean --if-exists --no-owner < dash.dump;
  rm -f dash.dump && $C start api &&
  $C exec -T postgres psql -U dash -d dash -tAc "select count(*) || '"'"' tasks'"'"' from tasks"'
