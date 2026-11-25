#!/usr/bin/env bash
# Prints a fingerprint of the database: run it on the old server and on the
# new one (or on a restored backup) and compare the two outputs with `diff`.
# Identical output means the same data, the same migrations and the same
# protections (triggers) are in place. It only reads; it changes nothing.
#
#   ./scripts/ops/verify-migration.sh > /tmp/fingerprint-new.txt
#   diff /tmp/fingerprint-old.txt /tmp/fingerprint-new.txt && echo SAME
#
# On a server it runs psql inside the postgres container (COMPOSE_FILE, default
# docker-compose.hetzner.yml). To check any database directly, set PSQL_URL.
# Stop the app first (docker compose stop app), or members' sign-ins will
# change the session tables between the two runs.
set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.hetzner.yml}"

q() {
  if [ -n "${PSQL_URL:-}" ]; then
    psql "$PSQL_URL" -X -At -F'|' -v ON_ERROR_STOP=1 -c "$1"
  else
    docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U mcfinancial -d mcfinancial -X -At -F'|' -v ON_ERROR_STOP=1 -c "$1"
  fi
}

echo "== migrations (finished, not rolled back)"
q "SELECT count(*), coalesce(max(migration_name), '') FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"
echo "== migrations unfinished or rolled back (must be 0)"
q "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL"

echo "== protections: user triggers, by table and name"
q "SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND n.nspname = 'public' ORDER BY 1, 2"
echo "== protections: check constraints, by table and name"
q "SELECT conrelid::regclass::text, conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace ORDER BY 1, 2"

echo "== sequences (next ids, e.g. the audit log)"
q "SELECT sequencename, coalesce(last_value::text, 'unused') FROM pg_sequences WHERE schemaname = 'public' ORDER BY 1"

echo "== rows and content checksum, per table"
for table in $(q "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1"); do
  echo "$table|$(q "SELECT count(*), md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) FROM \"$table\" t")"
done
