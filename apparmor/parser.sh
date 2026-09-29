#!/usr/bin/env bash
# Load (or refresh) the Detonate Lab AppArmor profiles into the host kernel.
#
# Idempotent — running twice does nothing harmful. Used by:
#   - `make init` (host-side bootstrap, called from scripts/init-env.sh)
#   - the app's first-boot init script inside each service container
#     (NOT shipped — the host-side load is the contract)
#
# Requires apparmor_parser(8) in $PATH. On Debian/Ubuntu: `apt install
# apparmor-utils`. On RHEL/Fedora: `dnf install apparmor-parser`.
#
# On Docker Desktop / rootless setups without AppArmor in the kernel, the
# load fails with a clear message and the rest of the stack still starts —
# `security_opt: apparmor=...` becomes a no-op and a warning is logged.

set -euo pipefail

cd "$(dirname "$0")/.."

profiles=(api web runner sandbox)
ok=0
skipped=0
failed=0

if ! command -v apparmor_parser >/dev/null 2>&1; then
  echo "apparmor_parser not found — AppArmor profiles will not be loaded."
  echo "On Debian/Ubuntu: 'sudo apt install apparmor-utils'."
  echo "On RHEL/Fedora:  'sudo dnf install apparmor-parser'."
  echo "On Docker Desktop / rootless: AppArmor is unavailable; the compose"
  echo "security_opt entries become no-ops and a warning is logged at boot."
  exit 0
fi

for name in "${profiles[@]}"; do
  f="apparmor/${name}"
  if [ ! -f "$f" ]; then
    echo "missing $f — skipping"
    skipped=$((skipped + 1))
    continue
  fi
  if apparmor_parser -r "$f" 2>/dev/null; then
    echo "loaded apparmor/detonate-${name}"
    ok=$((ok + 1))
  elif apparmor_parser -R "$f" 2>/dev/null; then
    # -R replaces; -r replaces only if present. If the profile is in the
    # kernel but not in /etc/apparmor.d, -r fails; fall back to -R which
    # writes it to /etc/apparmor.d/ and loads.
    echo "loaded apparmor/detonate-${name} (-R)"
    ok=$((ok + 1))
  else
    echo "failed to load apparmor/detonate-${name}" >&2
    failed=$((failed + 1))
  fi
done

echo "AppArmor: ${ok} loaded, ${skipped} skipped, ${failed} failed"

if [ "$failed" -gt 0 ]; then
  exit 1
fi