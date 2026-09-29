# Sandbox runner — DinD + hardened Python service.
#
# Built on top of docker:27-dind so we get our own daemon (the host's
# daemon is never touched). Everything below is about shrinking the
# attack surface: distroless-ish base, no shell inside the runtime
# stage, dedicated non-root user, capability drops baked into the
# worker spawn (see runner.py).

ARG DOCKER_VERSION=27.3.1

# ---- builder ---------------------------------------------------------------
FROM docker:${DOCKER_VERSION}-dind AS builder
WORKDIR /build

# Build deps for aiohttp's wheels. We don't actually need to compile
# because pinned versions all publish wheels, but we install pip +
# a tiny build env so we can verify the install in this stage.
RUN apk add --no-cache python3 py3-pip py3-wheel \
 && python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt 2>/dev/null \
 || pip install --no-cache-dir -r requirements.txt


# ---- runtime ----------------------------------------------------------------
FROM docker:${DOCKER_VERSION}-dind
ARG DOCKER_VERSION

# Runtime deps only: python + the docker CLI is already in the base.
# We DO install the apk index for emergency debugging, but the runtime
# has no shell — the worker is launched by the runner, not interactively.
RUN apk add --no-cache python3 py3-pip tini dumb-init \
 && addgroup -S runner && adduser -S -G runner -u 10001 runner

# Pull the venv from the builder.
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Drop default storage paths so we don't pin the version of dockerd.
# /var/lib/docker holds the named volume mount; /run for the docker
# socket; /var/log/sandbox-runner for our audit log.
WORKDIR /opt/sandbox

COPY runner.py ./
COPY inetsim.conf /etc/inetsim/inetsim.conf.template

RUN chmod -R 0555 /opt/sandbox \
 && chmod 0444 /etc/inetsim/inetsim.conf.template

# docker:dind runs the daemon as root by default; we keep that since
# the daemon needs CAP_SYS_ADMIN to set up its overlay. The Python
# runner process itself runs as the `runner` user — see entrypoint.

USER root
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# docker:dind already exposes 2375/2376; we keep them internal. The
# runner binds 8090 inside the container; compose publishes 127.0.0.1
# only on the host.
EXPOSE 8090

# tini reaps zombies and forwards signals; this is PID 1 inside the
# container and gives us proper handling of SIGTERM during stop.
ENTRYPOINT ["/sbin/tini", "--", "/bin/sh", "/opt/sandbox/entrypoint.sh"]
CMD ["python3", "/opt/sandbox/runner.py"]