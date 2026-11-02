#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
output="backups/lore-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_dump -U lore -d lore -Fc > "$output"
test -s "$output"
echo "Saved $output; copy it to protected off-server storage."
