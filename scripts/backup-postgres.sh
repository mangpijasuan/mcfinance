#!/usr/bin/env bash
# Nightly Postgres backup for the Hetzner production stack.
# Run from the repo root, e.g. via cron:
#   0 3 * * * cd /path/to/mc-management && ./scripts/backup-postgres.sh >> /var/log/mc-backup.log 2>&1
set -euo pipefail

COMPOSE_FILE="docker-compose.hetzner.yml"
BACKUP_DIR="backups"
RETENTION_DAYS=14
DB_USER="mc_admin"
DB_NAME="mc_admin"

mkdir -p "$BACKUP_DIR"

timestamp=$(date +%Y%m%d-%H%M%S)
out_file="$BACKUP_DIR/mc_admin-$timestamp.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$out_file"

echo "Backup written to $out_file"

find "$BACKUP_DIR" -name 'mc_admin-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Pruned backups older than $RETENTION_DAYS days"
