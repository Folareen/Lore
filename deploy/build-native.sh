#!/usr/bin/env bash
# Build on a development/build machine, never on the memory-constrained VPS.
set -euo pipefail
cd "$(dirname "$0")/.."
output="${1:?Usage: bash deploy/build-native.sh /absolute/new-release-directory}"
case "$output" in /*) ;; *) echo 'Use an absolute output directory.' >&2; exit 1 ;; esac
if [ -e "$output" ]; then
  echo 'Choose a new output directory to avoid overwriting a release.' >&2
  exit 1
fi
umask 077
mkdir -p "$output"
docker build --platform linux/amd64 --target native \
  --build-arg API_INTERNAL_URL=http://127.0.0.1:4200 \
  --output "type=local,dest=$output" .
cp -R deploy "$output/deploy"
echo 'Native Linux release exported. Add its private .env.production before installation.'
