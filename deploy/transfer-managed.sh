#!/usr/bin/env bash
# One-time transfer from Lore's existing private PostgreSQL container to empty Neon.
set -euo pipefail
if [ "$(id -u)" != 0 ]; then echo 'Run with sudo from the native release.' >&2; exit 1; fi
release="$(cd "$(dirname "$0")/.." && pwd -P)"
root=/home/deploy/lore-native
case "$release" in "$root"/releases/*) ;; *) echo 'Unexpected release path.' >&2; exit 1 ;; esac
umask 077
mkdir -p "$root/backups"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
pg_env="$root/backups/transfer-$stamp.env"
dump="$root/backups/transfer-$stamp.dump"
postgres="$(docker ps -q --filter label=com.docker.compose.project=lore-production --filter label=com.docker.compose.service=postgres)"
test -n "$postgres"
mapfile -t original_containers < <(docker ps -q --filter label=com.docker.compose.project=lore-production)
rollback() {
  trap - ERR
  rm -f "$pg_env"
  docker start "${original_containers[@]}" >/dev/null || true
  echo 'Transfer/cutover failed. Previous Lore containers restarted; protected source backup retained.' >&2
}
trap rollback ERR
trap 'rm -f "$pg_env"; docker exec "$postgres" rm -f /tmp/lore-transfer-ca.crt >/dev/null 2>&1 || true' EXIT
node "$release/deploy/check-managed.mjs"
node "$release/deploy/prepare-transfer.mjs" "$pg_env" /home/deploy/lore-production/.env.production
test -s /etc/ssl/certs/ca-certificates.crt
docker cp /etc/ssl/certs/ca-certificates.crt "$postgres:/tmp/lore-transfer-ca.crt"
# Stop only Lore writers. PostgreSQL stays up until the verified transfer completes.
for service in api web; do
  container="$(docker ps -q --filter label=com.docker.compose.project=lore-production --filter "label=com.docker.compose.service=$service")"
  if [ -n "$container" ]; then docker stop --time 60 "$container" >/dev/null; fi
done
docker exec "$postgres" pg_dump -U lore -d lore -Fc > "$dump"
counts='select json_build_array((select count(*) from users),(select count(*) from channels),(select count(*) from source_events),(select count(*) from cases),(select count(*) from open_loops),(select count(*) from public_entries))'
source_counts="$(docker exec "$postgres" psql -X -U lore -d lore -Atc "$counts")"
docker exec -i --env-file "$pg_env" "$postgres" pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error < "$dump"
target_counts="$(docker exec --env-file "$pg_env" "$postgres" psql -X -Atc "$counts")"
if [ "$source_counts" != "$target_counts" ]; then echo 'Transferred record counts differ; activation refused.' >&2; false; fi
docker exec "$postgres" rm -f /tmp/lore-transfer-ca.crt
echo 'Protected database transfer verified; activating native services.'
# The old writers remain stopped, so the verified snapshot cannot become stale.
LORE_MANAGED_DATA_MIGRATED=1 bash "$release/deploy/install-native.sh"
rm -f "$pg_env"
trap - ERR
echo 'Existing Lore accounts and channel data are now preserved in managed PostgreSQL.'
