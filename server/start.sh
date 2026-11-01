#!/bin/sh
# Container entrypoint. Keeps the database in Cloudflare R2 so a redeploy never loses data:
#   1) disk empty  -> restore the latest replica from R2 (abort on real errors; never fall back to demo data silently)
#   2) run the app under Litestream, which streams every change to R2 within seconds
set -e
export DB_FILE="${DB_FILE:-/app/server/data/souqna.db}"
export LS_KEY_ID="${BACKUP_R2_ACCESS_KEY_ID:-$R2_ACCESS_KEY_ID}"
export LS_SECRET="${BACKUP_R2_SECRET_ACCESS_KEY:-$R2_SECRET_ACCESS_KEY}"
CMD="npm run boot -w server"

# Optional one-shot catalog migration. Runs ONLY when CATALOG_MIGRATE=yes is set. It first rehearses on a copy of the database
# (never touching the real one), and applies only if that passes; the tool also backs up first and rolls back on any mismatch.
# If anything fails the app still starts on the old sections, untouched. Remove the variable after the first successful boot.
run_catalog() {
  [ "$CATALOG_MIGRATE" = "yes" ] || return 0
  [ -f "$DB_FILE" ] || { echo "[catalog] no database yet - nothing to migrate"; return 0; }
  echo "[catalog] CATALOG_MIGRATE=yes - rehearsing on a copy first"
  if npm run catalog -w server -- test --db "$DB_FILE" && CONFIRM_CATALOG_MIGRATION=yes npm run catalog -w server -- apply --db "$DB_FILE" --approved-by "${CATALOG_APPROVED_BY:-owner}"; then
    echo "[catalog] migration applied and verified"
  else
    echo "[catalog] migration did NOT run or was rolled back - the database is unchanged; starting on the existing sections"
  fi
}

if [ -n "$BACKUP_R2_BUCKET" ] && [ -n "$R2_ACCOUNT_ID" ] && [ -n "$LS_KEY_ID" ] && [ -n "$LS_SECRET" ] && [ "$BACKUP_R2_BUCKET" != "$R2_BUCKET" ]; then
  if [ ! -f "$DB_FILE" ]; then
    echo "[start] no local database - restoring from R2 (if a replica exists)…"
    litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_FILE"
  fi
  run_catalog
  echo "[start] replicating $DB_FILE to R2 bucket $BACKUP_R2_BUCKET"
  exec litestream replicate -config /etc/litestream.yml -exec "$CMD"
fi

echo "[start] WARNING: R2 replication is NOT configured (set BACKUP_R2_BUCKET + R2_* keys). Data on this disk is lost on redeploy unless it is a persistent volume."
run_catalog
exec $CMD
