#!/bin/sh
#
# SQLite backup script for the chess platform.
# Creates a timestamped backup and retains the last 7 copies.
#
# Usage:
#   DATABASE_URL=/app/data/chess.db ./scripts/backup.sh
#
# Environment:
#   DATABASE_URL  Path to the SQLite database (default: /app/data/chess.db)

set -eu

DB_PATH="${DATABASE_URL:-/app/data/chess.db}"
BACKUP_DIR="$(dirname "$DB_PATH")/backups"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/chess-$TIMESTAMP.db"
RETAIN_COUNT=7

# Validate source database exists
if [ ! -f "$DB_PATH" ]; then
  echo "Error: database not found at $DB_PATH" >&2
  exit 1
fi

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Create consistent backup using sqlite3 .backup command
echo "Backing up $DB_PATH -> $BACKUP_FILE"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Verify the backup was created and is non-empty
if [ ! -s "$BACKUP_FILE" ]; then
  echo "Error: backup file is empty or was not created" >&2
  exit 1
fi

echo "Backup complete: $BACKUP_FILE ($(wc -c < "$BACKUP_FILE") bytes)"

# Rotate: keep only the most recent $RETAIN_COUNT backups
# List backup files sorted oldest-first, delete all but the newest $RETAIN_COUNT
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/chess-*.db 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$RETAIN_COUNT" ]; then
  DELETE_COUNT=$((BACKUP_COUNT - RETAIN_COUNT))
  ls -1t "$BACKUP_DIR"/chess-*.db | tail -n "$DELETE_COUNT" | while read -r OLD_BACKUP; do
    echo "Removing old backup: $OLD_BACKUP"
    rm -f "$OLD_BACKUP"
  done
fi
