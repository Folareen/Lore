#!/usr/bin/env bash
# Run once as root after reviewing the staged release. Existing sites are preserved.
set -euo pipefail
if [ "$(id -u)" != 0 ]; then
  echo 'Run with sudo from the staged Lore release directory.' >&2
  exit 1
fi
cd "$(dirname "$0")/.."
test -s .env.production
test -s deploy/lore.caddy
test -s /etc/caddy/Caddyfile
if [ -s lore-images.tar.gz ]; then
  gzip -dc lore-images.tar.gz | docker load
fi
docker compose --env-file .env.production -f compose.production.yaml up -d --wait postgres redis
bash deploy/backup.sh
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps api node dist/database/migrate.js
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps api node dist/database/seed.js
docker compose --env-file .env.production -f compose.production.yaml up -d --wait api web
backup="/etc/caddy/Caddyfile.before-lore-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p /etc/caddy/Caddyfile "$backup"
if [ -f /etc/caddy/lore.caddy ]; then
  cp -p /etc/caddy/lore.caddy "$backup.lore"
fi
restore_caddy() {
  cp -p "$backup" /etc/caddy/Caddyfile
  if [ -f "$backup.lore" ]; then
    cp -p "$backup.lore" /etc/caddy/lore.caddy
  else
    rm -f /etc/caddy/lore.caddy
  fi
}
install -m 644 deploy/lore.caddy /etc/caddy/lore.caddy
if ! grep -Fqx 'import /etc/caddy/lore.caddy' /etc/caddy/Caddyfile; then
  printf '\nimport /etc/caddy/lore.caddy\n' >> /etc/caddy/Caddyfile
fi
if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  restore_caddy
  echo 'Caddy validation failed; original configuration restored.' >&2
  exit 1
fi
if ! systemctl reload caddy; then
  restore_caddy
  systemctl reload caddy
  echo 'Lore reload failed; previous Caddy configuration restored.' >&2
  exit 1
fi
echo 'Lore is running. Existing Caddy sites are preserved.'
