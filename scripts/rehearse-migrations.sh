#!/usr/bin/env bash
# Explicitly requested isolated rehearsal. Never applies migrations to the source.
set -euo pipefail
cd "$(dirname "$0")/.."
lab_suffix="$(date +%s)-$$"
lab_network="hr-nexus-v2-lab-${lab_suffix}"
lab_container="hr-nexus-v2-lab-${lab_suffix}"

docker network create --internal "$lab_network" >/dev/null
docker run -d --pull never --name "$lab_container" --network "$lab_network" \
  --network-alias hr-nexus-v2-migration-lab \
  --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=512m \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
printf 'Isolated laboratory container/network: %s\n' "$lab_container"
lab_ready=false
for attempt in {1..30}; do
  if docker exec "$lab_container" pg_isready -U postgres >/dev/null 2>&1; then
    lab_ready=true
    break
  fi
  sleep 1
done
if [[ "$lab_ready" != true ]]; then
  printf 'Temporary PostgreSQL did not become ready; source was not changed.\n' >&2
  exit 1
fi

docker exec "$lab_container" createdb -U postgres hr_nexus_v2_upgrade
# A consistent logical snapshot of the database held in the existing volume.
# Stream directly; do not write or print account records/credentials/dump contents.
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  | docker exec -i "$lab_container" pg_restore -U postgres -d hr_nexus_v2_upgrade \
      --no-owner --no-acl --exit-on-error

docker run --rm --pull never --volumes-from hr-nexus-backend:ro \
  --network "$lab_network" -e HR_NEXUS_MIGRATION_LAB=1 \
  --mount "type=bind,src=$PWD/database,dst=/database,readonly" \
  --mount "type=bind,src=$PWD/docs,dst=/docs,readonly" \
  hr-nexus-backend node --import tsx --test tests/migrations.integration.test.ts

printf 'Rehearsal complete. Source unchanged. Laboratory retained: %s\n' "$lab_container"
printf 'No cleanup, seed replay, source migration or Docker credential change was performed.\n'
