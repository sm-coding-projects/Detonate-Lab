#!/bin/sh
# Restore the database + secrets + uploads from a tarball created by
# scripts/backup.sh.
#
# Usage:
#   ./scripts/restore.sh ./backups/detonate-lab-2025-01-15T103000Z.tar.gz
#   cat backup.tar.gz | ./scripts/restore.sh -
#
# WARNING: this DROPS the existing database and replaces it with the
# contents of the dump. The secrets/ directory is *replaced*, not merged
# — new auth tokens issued after the backup will be discarded. If you
# want a merge instead, run `tar -xf backup.tar.gz secrets` and diff
# manually.
#
# The script also wipes the running sandbox-runner (if any) so a fresh
# detonation history is loaded from the database.

set -eu

usage() {
  cat <<'USAGE'
Usage: restore.sh BACKUP.tar.gz
       cat BACKUP.tar.gz | restore.sh -

The stack is left running. The 'db' service is restarted as part of the
restore; the 'api' service is restarted after the secrets directory is
replaced so it picks up the new credentials.
USAGE
  exit "${1:-0}"
}

case "${1:-}" in
  -h|--help) usage ;;
  -)        TAR_SRC="-" ;;
  "")       usage 1 ;;
  *)        TAR_SRC="$1" ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not in PATH" >&2
  exit 2
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# ---- Extract ----------------------------------------------------------------
echo "[1/4] extracting backup..."
if [ "$TAR_SRC" = "-" ]; then
  tar -xzf - -C "$tmp"
else
  [ -f "$TAR_SRC" ] || { echo "no such file: $TAR_SRC" >&2; exit 1; }
  tar -xzf "$TAR_SRC" -C "$tmp"
fi

test -f "$tmp/detonate.dump" || { echo "archive missing detonate.dump" >&2; exit 1; }
test -f "$tmp/MANIFEST"      || { echo "archive missing MANIFEST"      >&2; exit 1; }

echo "      backup timestamp: $(grep '^timestamp=' "$tmp/MANIFEST" | cut -d= -f2)"

# ---- Secrets ----------------------------------------------------------------
echo "[2/4] restoring secrets/..."
if [ -f "$tmp/secrets.tar" ]; then
  tar -xf "$tmp/secrets.tar" -C .
else
  echo "      no secrets.tar in archive — keeping current secrets/"
fi

# ---- Uploads ----------------------------------------------------------------
echo "[3/4] restoring uploads/..."
if [ -f "$tmp/uploads.tar" ]; then
  api_id=$(docker compose ps -q api | head -1)
  if [ -n "$api_id" ]; then
    docker run --rm \
      --volumes-from "$api_id" \
      -v "$tmp:/backup" \
      alpine:3.20 \
      sh -c 'rm -rf /uploads && tar -xf /backup/uploads.tar'
  else
    echo "      api service not running — uploads not restored" >&2
  fi
else
  echo "      no uploads.tar in archive — skipping"
fi

# ---- Database ---------------------------------------------------------------
echo "[4/4] restoring postgresql..."
db_id=$(docker compose ps -q db | head -1)
if [ -z "$db_id" ]; then
  echo "      db service not running — start the stack first" >&2
  exit 1
fi

# Restore is destructive: drop and recreate the public schema before loading
# the dump. We don't drop the database itself because pg_dump's custom
# format already includes the necessary DDL.
docker exec -u postgres "$db_id" \
  psql -d detonate -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO detonate;" \
  >/dev/null
docker exec -i "$db_id" \
  pg_restore -U detonate -d detonate --no-owner --clean --if-exists \
  < "$tmp/detonate.dump"

# ---- Restart ----------------------------------------------------------------
docker compose restart api >/dev/null 2>&1 || true
echo "done."