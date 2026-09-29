#!/usr/bin/env bash
# End-to-end test for the sandbox profile.
#
# Brings up the full stack with SANDBOX_CONNECTOR=docker, submits a
# clean text sample to the api, and asserts the resulting report is
# "clean" (or "suspicious" for an executable). The runner is the real
# aiohttp service, the worker is a real alpine DinD container, the
# network is the real `sandbox` internal network.
#
# Required:
#   - docker with compose v2
#   - openssl (for the token / cert generation)
#   - jq
#
# Usage:
#   ./scripts/test-sandbox-e2e.sh
#
# Exits 0 on success, non-zero on any assertion failure. Cleans up the
# compose stack on exit regardless of outcome.

set -euo pipefail
cd "$(dirname "$0")/.."

log()  { printf '\033[1;36m== %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

cleanup() {
  local rc=$?
  log "tearing down compose stack"
  docker compose --profile sandbox down -v --remove-orphans >/dev/null 2>&1 || true
  # Don't clobber the user's secrets on a normal run, but on a hard
  # failure we leave them so they can inspect.
  if [ "$rc" -ne 0 ]; then
    fail "test failed (exit=$rc); secrets/.env preserved for inspection"
  fi
}
trap cleanup EXIT

# ---- Preflight ----------------------------------------------------------------
command -v docker >/dev/null   || fail "docker is required"
command -v openssl >/dev/null  || fail "openssl is required"
command -v jq     >/dev/null   || fail "jq is required"

docker compose version >/dev/null 2>&1 || fail "docker compose v2 is required"

# ---- Generate secrets --------------------------------------------------------
log "generating .env + secrets/"
BASIC_AUTH=0 TLS=0 SANDBOX=1 ./scripts/init-env.sh --force >/dev/null

# Flip the connector to docker for this run
echo "SANDBOX_CONNECTOR=docker" >> .env

# ---- Build & bring up --------------------------------------------------------
log "building images (this can take a few minutes on first run)"
docker compose --profile sandbox build >/dev/null

log "starting stack with sandbox profile"
docker compose --profile sandbox up -d >/dev/null

# ---- Wait for the api to be ready -------------------------------------------
log "waiting for api to be healthy"
for i in $(seq 1 60); do
  if docker compose exec -T api node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then fail "api did not become healthy"; fi
  sleep 2
done

# ---- Wait for sandbox-runner to be ready ------------------------------------
log "waiting for sandbox-runner to be ready"
RUNNER_TOKEN=$(cat secrets/sandbox_runner_token)
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:8090/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then fail "sandbox-runner never bound 127.0.0.1:8090"; fi
  sleep 2
done

# ---- Submit a clean text sample ---------------------------------------------
log "submitting clean text sample"
SAMPLE_PATH=$(mktemp /tmp/e2e-clean-XXXXXX.txt)
echo "this is a benign text sample" > "$SAMPLE_PATH"

RESP=$(curl -fsS -X POST http://localhost:8080/api/submit \
  -F "file=@${SAMPLE_PATH}" \
  -F "userLabel=e2e-clean")
JOB_ID=$(echo "$RESP" | jq -r '.jobId')
[ -n "$JOB_ID" ] && [ "$JOB_ID" != "null" ] || fail "submit did not return jobId: $RESP"

# Poll the result endpoint
for i in $(seq 1 60); do
  STATUS=$(curl -fsS "http://localhost:8080/api/jobs/${JOB_ID}" | jq -r '.status')
  case "$STATUS" in
    done)  break ;;
    error) fail "job errored: $(curl -fsS "http://localhost:8080/api/jobs/${JOB_ID}")" ;;
  esac
  sleep 2
done
[ "$STATUS" = "done" ] || fail "job did not complete in time"

REPORT=$(curl -fsS "http://localhost:8080/api/jobs/${JOB_ID}/report")
VERDICT=$(echo "$REPORT" | jq -r '.verdict')
CONNECTOR=$(echo "$REPORT" | jq -r '.connector // "unknown"')

log "report: verdict=$VERDICT connector=$CONNECTOR"

# The classifier in the runner returns "clean" for text/plain.
[ "$VERDICT" = "clean" ] || fail "expected verdict=clean, got $VERDICT (full report: $REPORT)"

# And the report's `connector` field should be "docker" — i.e. it went
# through the real runner, not the static connector.
[ "$CONNECTOR" = "docker" ] || fail "expected connector=docker, got $CONNECTOR"

# ---- Submit a suspicious executable -----------------------------------------
log "submitting suspicious executable"
EXE_PATH=$(mktemp /tmp/e2e-suspect-XXXXXX.bin)
head -c 4096 /dev/urandom > "$EXE_PATH"

RESP=$(curl -fsS -X POST http://localhost:8080/api/submit \
  -F "file=@${EXE_PATH}" \
  -F "userLabel=e2e-suspect" \
  -F "fileType=application/x-executable")
JOB_ID=$(echo "$RESP" | jq -r '.jobId')

for i in $(seq 1 60); do
  STATUS=$(curl -fsS "http://localhost:8080/api/jobs/${JOB_ID}" | jq -r '.status')
  case "$STATUS" in
    done)  break ;;
    error) fail "job errored: $(curl -fsS "http://localhost:8080/api/jobs/${JOB_ID}")" ;;
  esac
  sleep 2
done

REPORT=$(curl -fsS "http://localhost:8080/api/jobs/${JOB_ID}/report")
VERDICT=$(echo "$REPORT" | jq -r '.verdict')
log "report: verdict=$VERDICT"

# Runner classifier: application/x-executable → "suspicious"
[ "$VERDICT" = "suspicious" ] || fail "expected verdict=suspicious, got $VERDICT (full report: $REPORT)"

# ---- Submit a sample the runner has to time out on --------------------------
# (Skipped: the stub classifier finishes in <1s, so there's no timeout
# path to exercise here. A future change that adds a long-running
# static scan would add this case.)

# ---- Done --------------------------------------------------------------------
rm -f "$SAMPLE_PATH" "$EXE_PATH"
log "PASS"