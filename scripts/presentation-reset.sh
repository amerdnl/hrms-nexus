#!/bin/sh
# Rebuilds the isolated presentation environment: Meridian Digital Solutions Sdn. Bhd.
#
#   scripts/presentation-reset.sh
#
# It is the only supported way to restore the presentation baseline, and it is safe to run
# between rehearsals: the environment is recreated from schema.sql, migrated and seeded, so a
# demonstration that changed data leaves nothing behind.
#
# SAFETY. The target is proved before anything is dropped:
#   1. the server must be the isolated laboratory container, and must not be the application's;
#   2. the database must be named exactly hr_nexus_v3_presentation;
#   3. that server must not hold the application database, which proves this is not it;
#   4. the target, its server and its current size are printed before the drop.
# Any failure stops the script before a destructive statement runs.
set -e

DB=hr_nexus_v3_presentation
LAB=hr-nexus-v2-migration-lab
APP_DB=hr_nexus
APP_SERVER=hr-nexus-postgres
API=hr-nexus-v3-presentation-api
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if [ "$LAB" = "$APP_SERVER" ]; then
  echo "Refusing: the configured server is the application's own." >&2; exit 1
fi
if [ "$DB" = "$APP_DB" ]; then
  echo "Refusing: the configured database is the application's own." >&2; exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -qx "$LAB"; then
  echo "Refusing: the isolated laboratory server '$LAB' is not running." >&2; exit 1
fi
if docker exec "$LAB" psql -U postgres -Atqc \
  "SELECT 1 FROM pg_database WHERE datname = '$APP_DB'" | grep -q 1; then
  echo "Refusing: '$LAB' holds a database called '$APP_DB'. This may be the application server." >&2; exit 1
fi

echo "Target server   : $LAB (isolated laboratory; the application server is $APP_SERVER)"
echo "Target database : $DB"
echo "Currently holds : $(docker exec "$LAB" psql -U postgres -d postgres -Atqc \
  "SELECT coalesce((SELECT pg_size_pretty(pg_database_size('$DB')) FROM pg_database WHERE datname='$DB'), 'nothing yet')")"
echo "Rebuilding..."

docker exec "$LAB" psql -U postgres -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)"
docker exec "$LAB" psql -U postgres -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $DB TEMPLATE template0"
docker exec -i "$LAB" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -q < database/schema.sql

docker run --rm --volumes-from hr-nexus-backend:ro --network "$LAB" -w /app \
  -e MIGRATION_DATABASE_URL=postgresql://postgres@$LAB/$DB \
  hr-nexus-backend npx tsx src/database/migrate.ts apply --database $DB > /dev/null

docker run --rm --volumes-from hr-nexus-backend:ro --network "$LAB" -w /app \
  -e PRESENTATION_DATABASE_URL=postgresql://postgres@$LAB/$DB \
  -e PRESENTATION_PASSWORD="${PRESENTATION_PASSWORD:?set PRESENTATION_PASSWORD to the demo password}" \
  hr-nexus-backend npx tsx src/database/seedPresentation.ts --database $DB "$@"

if docker ps --format '{{.Names}}' | grep -qx "$API"; then
  docker restart "$API" > /dev/null
  echo "Restarted $API so it reads the rebuilt company."
fi
echo "Presentation environment rebuilt: $DB on $LAB."
