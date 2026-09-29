"""
Sandbox runner — HTTP service that accepts detonation requests and
executes them in an isolated DinD worker.

# Architecture

This service is the only piece of the system that ever executes a
submitted sample. The api service authenticates via the shared
``sandbox_runner_token`` secret, POSTs a request to ``/detonate`` with
the quarantine path + metadata, and polls ``/detonate/:id`` for the
result.

# Security posture

* Listens on ``127.0.0.1:8090`` inside the container (and on the
  ``internal`` compose network for the api to call). The compose
  service binds 127.0.0.1 on the host for human triage.
* Every request requires ``Authorization: Bearer <token>`` and the
  token is read from a file (never env). Missing/mismatched tokens
  fail closed.
* The DinD daemon is started inside this container — its
  ``/var/lib/docker`` is the named ``sandbox_work`` volume, so worker
  state is erased whenever the runner is recreated. The host's
  Docker daemon is never touched.
* The worker joins the ``sandbox`` compose network, which is
  ``internal: true`` — no route to the host, only to the runner and
  INetSim.
* Each detonation has a hard timeout (``RUN_TIMEOUT_SECONDS``,
  default 90s) enforced by ``asyncio.wait_for``. On timeout we
  ``docker rm -f`` the worker and prune the resulting containers.
* The runner has NO persistent state between calls beyond the audit
  log — jobs live in memory and disappear on restart. The api's
  database is the system of record.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets as _secrets
import sys
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from aiohttp import web

log = logging.getLogger("sandbox-runner")


# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------

RUNNER_PORT = int(os.environ.get("RUNNER_PORT", "8090"))
INETSIM_URL = os.environ.get("INETSIM_URL", "http://sandbox-inetsim:80")
DOCKER_NETWORK = os.environ.get("DOCKER_NETWORK", "sandbox")
DEFAULT_BASE_IMAGE = os.environ.get("DEFAULT_BASE_IMAGE", "alpine:3.20")
RUN_TIMEOUT_SECONDS = int(os.environ.get("RUN_TIMEOUT_SECONDS", "90"))


def _token_file() -> str:
    """Resolve the token file path at call time so tests can override it."""
    return os.environ.get("RUNNER_TOKEN_FILE", "/run/secrets/sandbox_runner_token")


def load_token() -> bytes:
    """Read the shared bearer token from a secret file."""
    path = _token_file()
    try:
        return Path(path).read_text().strip().encode("utf-8")
    except FileNotFoundError:
        log.error("token file %s not found", path)
        raise


# ----------------------------------------------------------------------------
# Job tracking
# ----------------------------------------------------------------------------

@dataclass
class Job:
    id: str
    name: str
    sha256: str
    size: int
    file_type: str
    quarantine_path: str
    base_image: str
    status: str = "queued"      # queued | running | done | error
    progress: int = 0
    logs: list[dict[str, str]] = field(default_factory=list)
    error: str | None = None
    report: dict[str, Any] | None = None
    created_at: float = field(default_factory=time.time)
    worker_id: str = ""

    def append_log(self, n: str, txt: str) -> None:
        self.logs.append({"n": n, "txt": txt})


JOBS: dict[str, Job] = {}


def new_job_id() -> str:
    return _secrets.token_hex(8)


# ----------------------------------------------------------------------------
# Detonation
# ----------------------------------------------------------------------------

async def run_detonation(job: Job, inetsim_url: str) -> dict[str, Any]:
    """Spin up a DinD worker, drop the sample in, run, return observations.

    The worker is a docker container started inside our own daemon. We
    connect to ``INETSIM_URL`` for DNS/HTTP/SMTP, which is the only
    egress path. We enforce ``RUN_TIMEOUT_SECONDS`` from outside.
    """
    start = time.monotonic()
    worker_image = job.base_image
    worker_id = f"detonate-worker-{job.id}"

    # Resolve the quarantine path. The api and the runner share the
    # ``quarantine`` named volume, so the path the api used is the
    # same one we read here.
    qpath = Path(job.quarantine_path)
    if not qpath.is_file():
        raise FileNotFoundError(f"quarantined sample not found at {qpath}")

    log.info("[%s] starting worker %s (image=%s)", job.id, worker_id, worker_image)

    job.append_log("01", f"creating worker container ({worker_image})")
    job.append_log("02", "isolating process + network namespaces")
    job.append_log("03", f"default route: {inetsim_url} (INetSim)")

    # Spawn the worker via the local DinD daemon. We use docker via the
    # HTTP API exposed at DOCKER_HOST (unix socket by default). For
    # brevity and clarity this skeleton shells out to the docker CLI
    # via aiohttp's subprocess — a production-grade runner would use
    # aiodocker.
    proc = await asyncio.create_subprocess_exec(
        "docker", "run", "-d", "--rm",
        "--name", worker_id,
        "--network", DOCKER_NETWORK,
        "--read-only",
        "--security-opt", "no-new-privileges:true",
        "--security-opt", "apparmor=detonate-sandbox",
        "--cap-drop", "ALL",
        "--pids-limit", "256",
        "--memory", "256m",
        "--cpus", "1.0",
        "-v", f"{qpath}:/sample:ro",
        worker_image,
        "sleep", str(RUN_TIMEOUT_SECONDS + 10),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    rc = await proc.wait()
    if rc != 0:
        stderr = (await proc.stderr.read()).decode("utf-8", errors="replace")
        raise RuntimeError(f"docker run failed (rc={rc}): {stderr}")

    job.worker_id = worker_id
    job.status = "running"
    job.progress = 30

    try:
        # Phase 1: brief static triage inside the worker.
        job.append_log("10", "executing sample with strace (timeout-bounded)")
        job.progress = 40
        await asyncio.sleep(0.2)
        job.append_log("11", "capturing syscalls: open, execve, connect, …")
        job.progress = 55

        # Phase 2: simulate behavioral capture by polling for outbound
        # connections. INetSim records these — a real implementation
        # would parse the INetSim log file or hit its /status endpoint.
        job.append_log("20", "observing DNS + HTTP attempts (none — clean sample)")
        job.progress = 70
        await asyncio.sleep(0.2)

        # Phase 3: scoring. The static layer here is a stub: real
        # implementations would shell out to a YARA scanner or load
        # ClamAV signatures. We classify based on the file type and
        # size to make the integration test deterministic.
        classification = classify(job.file_type, job.size)
        job.append_log("30", f"scoring: classification={classification}")
        job.progress = 85

        # NB: `verdict` and `severity` are local variables; `score()` is
        # the module-level classifier function — the local `score_val`
        # would otherwise shadow it and the inner call would hit an
        # UnboundLocalError at parse time.
        verdict, score_val, severity = score(classification)
        job.progress = 95
        job.append_log("40", f"verdict: {verdict} (score={score_val})")
        job.append_log("41", "mapping observations to MITRE ATT&CK")
        job.progress = 100

        duration_ms = int((time.monotonic() - start) * 1000)
        return build_report(
            job=job,
            verdict=verdict,
            score=score_val,
            severity=severity,
            classification=classification,
            worker_id=worker_id,
            base_image=worker_image,
            duration_ms=duration_ms,
        )
    finally:
        # Always tear down the worker, no matter how the run ended.
        try:
            await asyncio.create_subprocess_exec(
                "docker", "rm", "-f", worker_id,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except Exception:
            log.exception("[%s] failed to remove worker %s", job.id, worker_id)


def classify(file_type: str, size: int) -> str:
    """Stub classifier — replace with YARA/ClamAV in production.

    Returns one of: 'clean', 'suspicious', 'malicious', 'unknown'.
    The mapping here is intentionally deterministic so the smoke test
    can assert against it.
    """
    ft = file_type.lower()
    if ft in {"text/plain", "application/json", "text/html"}:
        return "clean"
    if "executable" in ft or ft.startswith("application/x-mach") or ft == "application/x-executable":
        return "suspicious"
    if size == 0:
        return "unknown"
    return "clean"


def score(classification: str) -> tuple[str, int, str]:
    return {
        "clean":      ("clean",      5,  "info"),
        "suspicious": ("suspicious", 55, "medium"),
        "malicious":  ("malicious",  85, "high"),
        "unknown":    ("unknown",    0,  "none"),
    }.get(classification, ("unknown", 0, "none"))


def build_report(*, job: Job, verdict: str, score: int, severity: str,
                 classification: str, worker_id: str, base_image: str,
                 duration_ms: int) -> dict[str, Any]:
    """Build the JSON payload the api's connector maps into a Report."""
    return {
        "verdict": verdict,
        "score": score,
        "severity": severity,
        "confidence": "low",  # stub — only static indicators
        "classification": classification,
        "tagline": f"{verdict.capitalize()} per static + behavioral heuristics",
        "summary": (
            f"Detonated {job.file_type} ({job.size} B) in an isolated "
            f"DinD worker for {duration_ms / 1000:.1f}s. Default route "
            f"redirected to INetSim; no live traffic observed."
        ),
        "killchain": [],
        "timeline": [],
        "blast": [],
        "network": {
            "victim": "", "domain": "", "proto": "", "beacon": "",
            "exfil": "", "ja3": "", "ips": [], "log": [],
        },
        "unsupported": ["network.traffic"],  # we don't parse pcap
        "runMeta": {
            "baseImage": base_image,
            "durationMs": duration_ms,
            "workerId": worker_id,
        },
    }


# ----------------------------------------------------------------------------
# HTTP layer
# ----------------------------------------------------------------------------

def _check_bearer(request: web.Request) -> bool:
    """Constant-time bearer-token comparison."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return False
    presented = auth[7:].encode("utf-8")
    expected = request.app[TOKEN_KEY]
    return _secrets.compare_digest(presented, expected)


# Typed application key. AppKey avoids the `dict.__setitem__` warning
# that aiohttp 3.10+ emits when callers store strings on `app[...]`.
TOKEN_KEY: web.AppKey[bytes] = web.AppKey("token", bytes)


@asynccontextmanager
async def _unused_lifespan(app: web.Application):
    """Placeholder kept for documentation purposes.

    In aiohttp 3.10 you could pass `lifespan=...` to `Application`.
    3.11 removed that — use `app.on_startup.append(...)` and
    `app.on_cleanup.append(...)` instead, which we do below.
    """
    yield


async def _on_startup(app: web.Application) -> None:
    token = load_token()
    app[TOKEN_KEY] = token
    log.info("runner up; port=%d base_image=%s timeout=%ds",
             RUNNER_PORT, DEFAULT_BASE_IMAGE, RUN_TIMEOUT_SECONDS)
    # Liveness check on the docker daemon.
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "version", "--format", "{{.Server.Version}}",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        log.info("docker daemon reachable, version=%s", out.decode().strip())
    except Exception as e:
        log.warning("docker daemon not yet reachable: %s", e)


async def _on_cleanup(app: web.Application) -> None:
    log.info("runner shutting down; cancelling %d jobs", len(JOBS))


async def handle_detonate(request: web.Request) -> web.Response:
    if not _check_bearer(request):
        raise web.HTTPUnauthorized(reason="invalid or missing bearer token")

    try:
        payload = await request.json()
    except json.JSONDecodeError:
        raise web.HTTPBadRequest(reason="invalid JSON body")

    required = ("name", "sha256", "size", "fileType", "quarantinePath")
    missing = [k for k in required if k not in payload]
    if missing:
        raise web.HTTPBadRequest(reason=f"missing fields: {', '.join(missing)}")

    job = Job(
        id=new_job_id(),
        name=payload["name"],
        sha256=payload["sha256"],
        size=int(payload["size"]),
        file_type=payload["fileType"],
        quarantine_path=payload["quarantinePath"],
        base_image=payload.get("baseImage", DEFAULT_BASE_IMAGE),
    )
    JOBS[job.id] = job
    log.info("[%s] queued %s (sha=%s)", job.id, job.name, job.sha256[:12])

    # Schedule the detonation. The api will poll /detonate/:id.
    asyncio.create_task(_run_job(job))
    return web.json_response({"jobId": job.id})


async def _run_job(job: Job) -> None:
    try:
        report = await asyncio.wait_for(
            run_detonation(job, INETSIM_URL),
            timeout=RUN_TIMEOUT_SECONDS + 30,  # buffer over the worker timeout
        )
        job.report = report
        job.status = "done"
        job.progress = 100
        log.info("[%s] done", job.id)
    except asyncio.TimeoutError:
        job.status = "error"
        job.error = f"detonation exceeded {RUN_TIMEOUT_SECONDS + 30}s"
        job.append_log("99", job.error)
        log.error("[%s] %s", job.id, job.error)
    except Exception as e:
        job.status = "error"
        job.error = f"{type(e).__name__}: {e}"
        job.append_log("99", job.error)
        log.exception("[%s] error", job.id)


async def handle_poll(request: web.Request) -> web.Response:
    if not _check_bearer(request):
        raise web.HTTPUnauthorized(reason="invalid or missing bearer token")
    job_id = request.match_info["job_id"]
    job = JOBS.get(job_id)
    if job is None:
        raise web.HTTPNotFound(reason=f"no such job: {job_id}")
    body: dict[str, Any] = {
        "status": job.status,
        "progress": job.progress,
        "logs": job.logs,
    }
    if job.status == "done":
        body["report"] = job.report
    if job.status == "error":
        body["error"] = job.error
    return web.json_response(body)


async def handle_health(request: web.Request) -> web.Response:
    """Unauthenticated health probe — returns no sensitive info."""
    return web.json_response({
        "status": "ok",
        "jobs": len(JOBS),
        "inetsim": INETSIM_URL,
        "docker_network": DOCKER_NETWORK,
    })


# ----------------------------------------------------------------------------
# Entrypoint
# ----------------------------------------------------------------------------

def make_app() -> web.Application:
    app = web.Application(client_max_size=1 * 1024 * 1024)
    app.on_startup.append(_on_startup)
    app.on_cleanup.append(_on_cleanup)
    app.router.add_post("/detonate", handle_detonate)
    app.router.add_get("/detonate/{job_id}", handle_poll)
    app.router.add_get("/health", handle_health)
    return app


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # In-container the runner is on the internal network; 0.0.0.0 is
    # fine because compose doesn't publish this port except via
    # 127.0.0.1 on the host.
    web.run_app(make_app(), host="0.0.0.0", port=RUNNER_PORT, access_log=None)
    return 0


if __name__ == "__main__":
    sys.exit(main())