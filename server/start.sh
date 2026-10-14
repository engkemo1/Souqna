#!/bin/sh
# Container entrypoint. Keeps the database in Cloudflare R2 so a redeploy never loses data:
#   1) disk empty  -> restore the latest replica from R2 (abort on real errors; never fall back to demo data silently)
#   2) run the app under Litestream, which streams every change to R2 within seconds
set -e
export DB_FILE="${DB_FILE:-/app/server/data/souqna.db}"
export LS_KEY_ID="${BACKUP_R2_ACCESS_KEY_ID:-$R2_ACCESS_KEY_ID}"
export LS_SECRET="${BACKUP_R2_SECRET_ACCESS_KEY:-$R2_SECRET_ACCESS_KEY}"
CMD="npm run boot -w server"

if [ -n "$BACKUP_R2_BUCKET" ] && [ -n "$R2_ACCOUNT_ID" ] && [ -n "$LS_KEY_ID" ] && [ -n "$LS_SECRET" ] && [ "$BACKUP_R2_BUCKET" != "$R2_BUCKET" ]; then
  if [ ! -f "$DB_FILE" ]; then
    echo "[start] no local database - restoring from R2 (if a replica exists)…"
    litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_FILE"
  fi
  echo "[start] replicating $DB_FILE to R2 bucket $BACKUP_R2_BUCKET"
  exec litestream replicate -config /etc/litestream.yml -exec "$CMD"
fi

echo "[start] WARNING: R2 replication is NOT configured (set BACKUP_R2_BUCKET + R2_* keys). Data on this disk is lost on redeploy unless it is a persistent volume."
exec $CMD
