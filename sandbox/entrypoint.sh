#!/bin/sh
# Sandbox runner entrypoint.
#
# 1. Make sure /var/lib/docker exists and is owned by root (DinD writes
#    its state here). It comes from the sandbox_work named volume in
#    compose, so this is a no-op after the first run.
# 2. Start the docker-in-docker daemon in the background. We wait for
#    it to come up before exec'ing the runner.
# 3. exec the runner process so tini (PID 1) reaps it on signal.
#
# All signals are forwarded to the runner via exec; dockerd gets its
# own process group and is killed on container stop.

set -eu

mkdir -p /var/lib/docker /run/docker /var/log/sandbox-runner

# Start dockerd. We use the stock entrypoint's arguments — they are
# tuned for DinD-in-composition. The host's docker daemon is untouched.
echo "[entrypoint] starting docker-in-docker..."
dockerd \
  --host=unix:///run/docker.sock \
  --pidfile=/run/docker/docker.pid \
  --data-root=/var/lib/docker \
  --exec-root=/run/docker \
  --iptables=false \
  --bridge=none \
  --ip-forward=false \
  --ip-masq=false \
  >/var/log/sandbox-runner/dockerd.log 2>&1 &
DOCKERD_PID=$!

# Wait for the socket to come up — `docker info` is a good probe.
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if docker version >/dev/null 2>&1; then
    echo "[entrypoint] dockerd ready (pid=$DOCKERD_PID, attempt $i)"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "[entrypoint] dockerd failed to come up:" >&2
    tail -20 /var/log/sandbox-runner/dockerd.log >&2
    exit 1
  fi
  sleep 1
done

# Now exec the runner. tini is the actual PID 1.
echo "[entrypoint] starting runner..."
exec "$@"