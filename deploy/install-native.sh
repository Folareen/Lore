#!/usr/bin/env bash
# Reviewed host cutover: preserve other apps, existing Lore volumes, and rollback files.
set -euo pipefail
if [ "$(id -u)" != 0 ]; then
  echo 'Run with sudo from the staged native release.' >&2
  exit 1
fi
release="$(cd "$(dirname "$0")/.." && pwd -P)"
root=/home/deploy/lore-native
case "$release" in "$root"/releases/*) ;; *) echo 'Stage under /home/deploy/lore-native/releases/ first.' >&2; exit 1 ;; esac
test -s "$release/.env.production"
test -s "$release/api/dist/main.js"
test -s "$release/web/apps/web/server.js"
test -s /etc/caddy/Caddyfile
/usr/bin/node -e 'if (process.versions.node.split(".")[0] !== "22") process.exit(1)'
umask 077
mkdir -p "$root/backups"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
previous=''
if [ -L "$root/current" ]; then previous="$(readlink -f "$root/current")"; fi
old_containers=()
if command -v docker >/dev/null; then
  mapfile -t old_containers < <(docker ps -q --filter label=com.docker.compose.project=lore-production)
  postgres="$(docker ps -q --filter label=com.docker.compose.project=lore-production --filter label=com.docker.compose.service=postgres)"

fi
chown -R deploy:deploy "$release"
chmod 700 "$release"
chmod 600 "$release/.env.production"
runuser -u deploy -- /usr/bin/node "$release/deploy/check-managed.mjs"
runuser -u deploy -- /usr/bin/node "$release/deploy/run-database.mjs" migrate
runuser -u deploy -- /usr/bin/node "$release/deploy/run-database.mjs" seed
caddy_backup="$root/backups/Caddyfile-$stamp"
cp -p /etc/caddy/Caddyfile "$caddy_backup"
if [ -f /etc/caddy/lore.caddy ]; then cp -p /etc/caddy/lore.caddy "$caddy_backup.lore"; fi
rollback() {
  trap - ERR
  systemctl stop lore-web lore-api || true
  if [ -n "$previous" ]; then
    ln -sfn "$previous" "$root/current"
    install -m 644 "$previous/deploy/lore-api.service" /etc/systemd/system/lore-api.service
    install -m 644 "$previous/deploy/lore-web.service" /etc/systemd/system/lore-web.service
    systemctl daemon-reload
    systemctl start lore-api lore-web || true
  fi
  if [ "${#old_containers[@]}" -gt 0 ]; then docker start "${old_containers[@]}" >/dev/null || true; fi
  cp -p "$caddy_backup" /etc/caddy/Caddyfile
  if [ -f "$caddy_backup.lore" ]; then cp -p "$caddy_backup.lore" /etc/caddy/lore.caddy; else rm -f /etc/caddy/lore.caddy; fi
  systemctl reload caddy || true
  echo 'Native cutover failed; previous application and Caddy route restored. Review service status.' >&2
}
trap rollback ERR
install -m 644 "$release/deploy/lore-api.service" /etc/systemd/system/lore-api.service
install -m 644 "$release/deploy/lore-web.service" /etc/systemd/system/lore-web.service
install -m 644 "$release/deploy/lore.caddy" /etc/caddy/lore.caddy
if ! grep -Fqx 'import /etc/caddy/lore.caddy' /etc/caddy/Caddyfile; then printf '\nimport /etc/caddy/lore.caddy\n' >> /etc/caddy/Caddyfile; fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
# Freeze old application writes before checking and backing up its database.
if [ -n "${postgres:-}" ]; then
  for service in api web; do
    container="$(docker ps -q --filter label=com.docker.compose.project=lore-production --filter "label=com.docker.compose.service=$service")"
    if [ -n "$container" ]; then docker stop "$container" >/dev/null; fi
  done
  docker exec "$postgres" pg_dump -U lore -d lore -Fc > "$root/backups/before-native-$stamp.dump"
  users="$(docker exec "$postgres" psql -U lore -d lore -Atc 'select count(*) from users')"
  if [ "$users" != 0 ]; then
    echo 'Existing Lore users found. Migrate the protected backup to Neon before cutover.' >&2
    false
  fi
fi
if [ "${#old_containers[@]}" -gt 0 ]; then docker stop "${old_containers[@]}" >/dev/null; fi
ln -sfn "$release" "$root/current"
systemctl daemon-reload
systemctl restart lore-api lore-web
wait_for() {
  local url="$1"
  for attempt in $(seq 1 45); do
    if curl -fsS --max-time 5 "$url" >/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}
wait_for http://127.0.0.1:4200/api/health
wait_for http://127.0.0.1:3200/demo
systemctl reload caddy
systemctl enable lore-api lore-web
trap - ERR
echo 'Lore native services are healthy. Old Lore containers are stopped; their volumes and backups remain intact.'
