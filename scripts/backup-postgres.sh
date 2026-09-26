#!/usr/bin/env bash
# Nightly Postgres backup for the Hetzner production stack.
# Run from the repo root, e.g. via cron:
#   0 3 * * * cd /path/to/mcfinance && ./scripts/backup-postgres.sh >> /var/log/mcfinance-backup.log 2>&1
set -euo pipefail

COMPOSE_FILE="docker-compose.hetzner.yml"
BACKUP_DIR="backups"
RETENTION_DAYS=14
DB_USER="mcfinance"
DB_NAME="mcfinance"

mkdir -p "$BACKUP_DIR"

timestamp=$(date +%Y%m%d-%H%M%S)
out_file="$BACKUP_DIR/mcfinance-$timestamp.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$out_file"

echo "Backup written to $out_file"

find "$BACKUP_DIR" -name 'mcfinance-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Pruned backups older than $RETENTION_DAYS days"
