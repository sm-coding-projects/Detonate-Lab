#!/bin/sh
# Snapshot the database + secrets + uploads to a tarball.
#
# Usage:
#   ./scripts/backup.sh                       # writes ./backups/detonate-lab-YYYY-MM-DD-HHMM.tar.gz
#   ./scripts/backup.sh /path/to/dir         # writes into the given dir
#   ./scripts/backup.sh -                    # writes the tarball to stdout (for piping to a remote store)
#
# The archive contains:
#   - postgresql dump         (custom format, compressed)
#   - secrets/                (htpasswd, db_password, sandbox_runner_token, TLS cert+key)
#   - uploads/                (samples uploaded via the API, max 1 GiB total)
#
# Restore is the inverse — see scripts/restore.sh.
#
# Exit codes:
#   0 — success
#   1 — invalid arguments
#   2 — required tools missing (docker, pg_dump optional)
#   3 — backup target dir not writable

set -eu

usage() {
  cat <<'USAGE'
Usage: backup.sh [DESTDIR|-]

  DESTDIR   Write a timestamped .tar.gz into DESTDIR (default: ./backups).
  -         Stream the tarball to stdout for piping (e.g. to s3, restic).

The stack must be running ('make up' or 'docker compose up -d'). The
script uses 'docker compose exec -T db pg_dump' so it never requires
pg_dump on the host.
USAGE
  exit "${1:-0}"
}

case "${1:-}" in
  -h|--help|"") ;;
  -) ;;
  *) DEST="$1" ;;
esac

DEST="${DEST:-./backups}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not in PATH" >&2
  exit 2
fi

# Make sure the api/web tier is up — otherwise we don't know which
# 'db' container to talk to. (We'll tolerate the api being down; we
# only need the db container for pg_dump.)
if ! docker compose ps --status running db >/dev/null 2>&1; then
  # `docker compose ps` exits non-zero when no services are running.
  if ! docker compose ps db 2>/dev/null | grep -q 'db'; then
    echo "warning: 'db' service is not running — the dump step will fail" >&2
  fi
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

TS=$(date -u +%Y-%m-%dT%H%M%SZ)

# ---- PostgreSQL dump -------------------------------------------------------
echo "[1/3] dumping postgresql..."
docker compose exec -T db pg_dump -U detonate -d detonate -Fc \
  > "$tmp/detonate.dump" || {
    echo "pg_dump failed; the database service may be down" >&2
    exit 1
  }

# ---- Secrets ----------------------------------------------------------------
echo "[2/3] archiving secrets..."
if [ -d secrets ]; then
  tar -cf "$tmp/secrets.tar" -C . secrets
else
  # No secrets dir means a fresh install — that's fine, but make a note.
  tar -cf "$tmp/secrets.tar" --files-from /dev/null
fi

# ---- Uploads ---------------------------------------------------------------
echo "[3/3] archiving uploads (if present)..."
if docker compose ps --status running api >/dev/null 2>&1; then
  # The api service uses a named volume 'uploads' for sample files.
  # We dump it via a one-off container so we don't need to mount the
  # volume into the running api (which is read-only).
  docker run --rm \
    --volumes-from "$(docker compose ps -q api | head -1)" \
    -v "$tmp:/backup" \
    alpine:3.20 \
    sh -c 'tar -cf /backup/uploads.tar -C / uploads 2>/dev/null || tar -cf /backup/uploads.tar --files-from /dev/null'
else
  tar -cf "$tmp/uploads.tar" --files-from /dev/null
fi

# ---- Pack -----------------------------------------------------------------
cat > "$tmp/MANIFEST" <<EOF
detonate-lab backup
timestamp=${TS}
hostname=$(hostname)
docker_version=$(docker --version | head -1)
EOF

case "${1:-}" in
  -)
    # Stream to stdout
    tar -czf - -C "$tmp" \
      MANIFEST \
      detonate.dump \
      secrets.tar \
      uploads.tar
    ;;
  *)
    mkdir -p "$DEST"
    test -w "$DEST" || { echo "DEST $DEST not writable" >&2; exit 3; }
    out="$DEST/detonate-lab-${TS}.tar.gz"
    tar -czf "$out" -C "$tmp" \
      MANIFEST \
      detonate.dump \
      secrets.tar \
      uploads.tar
    echo "wrote $out"
    ls -lh "$out"
    ;;
esac