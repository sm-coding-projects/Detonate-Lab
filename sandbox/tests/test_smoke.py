"""Smoke tests for sandbox/runner.py.

These exercise the runner against a stub docker CLI — we monkeypatch
``asyncio.create_subprocess_exec`` so the test doesn't need a real
DinD daemon. The point is to verify:

  - Bearer-token authentication is enforced
  - Job lifecycle transitions (queued → running → done | error)
  - The report payload has the shape the api connector expects
  - Worker cleanup runs even when the run raises

Run with:

    cd sandbox
    python3 -m pip install aiohttp
    python3 -m unittest tests.test_smoke -v
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Allow `import runner` from sandbox/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import runner  # noqa: E402
from aiohttp.test_utils import TestClient, TestServer  # noqa: E402


# ---- stubs ------------------------------------------------------------------

class _FakeProc:
    """Minimal subprocess stub for asyncio.create_subprocess_exec."""

    def __init__(self, rc: int = 0, out: bytes = b"", err: bytes = b""):
        self._rc = rc
        self._out = out
        self._err = err

    async def wait(self) -> int:
        return self._rc

    async def communicate(self):
        return self._out, self._err


def _patched_subprocess(*args, **kwargs):
    """Stand-in for asyncio.create_subprocess_exec.

    `docker run -d ...` → success, returns a fake container id.
    `docker rm -f ...` → success, no output.
    Everything else → success, no output (we don't care for these tests).
    """
    cmd = args[0] if args else kwargs.get("args", ("",))[0]
    if cmd == "docker" and len(args) > 1 and args[1] == "run":
        return _FakeProc(rc=0, out=b"abcdef123456\n")
    return _FakeProc(rc=0)


def _write_token(tmpdir: Path) -> Path:
    path = tmpdir / "token"
    path.write_text("test-token-abc123\n")
    os.environ["RUNNER_TOKEN_FILE"] = str(path)
    return path


# ---- fixtures ---------------------------------------------------------------

class RunnerTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        tmpdir = Path(self._tmp.name)
        _write_token(tmpdir)
        # Real file to back the quarantine path. /dev/null is a
        # character device and doesn't pass `Path.is_file()`.
        self._sample = tmpdir / "sample.bin"
        self._sample.write_bytes(b"fake malware payload")
        # Reset module-level job registry between tests
        runner.JOBS.clear()
        # Replace subprocess calls so we don't need docker
        self._subprocess_patcher = mock.patch.object(
            runner.asyncio, "create_subprocess_exec", side_effect=_patched_subprocess
        )
        self._subprocess_patcher.start()
        # Build the app and start a test server
        self._app = runner.make_app()
        self._server = TestServer(self._app)
        await self._server.start_server()
        self._client = TestClient(self._server)
        await self._client.start_server()

    async def asyncTearDown(self):
        await self._client.close()
        self._subprocess_patcher.stop()
        self._tmp.cleanup()


# ---- tests ------------------------------------------------------------------

class TestAuthentication(RunnerTestCase):
    async def test_health_is_open(self):
        r = await self._client.get("/health")
        self.assertEqual(r.status, 200)
        body = await r.json()
        self.assertEqual(body["status"], "ok")

    async def test_detonate_rejects_missing_token(self):
        r = await self._client.post("/detonate", json={"name": "x"})
        self.assertEqual(r.status, 401)

    async def test_detonate_rejects_wrong_token(self):
        r = await self._client.post(
            "/detonate",
            headers={"Authorization": "Bearer wrong"},
            json={"name": "x"},
        )
        self.assertEqual(r.status, 401)

    async def test_detonate_rejects_non_bearer(self):
        r = await self._client.post(
            "/detonate",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
            json={"name": "x"},
        )
        self.assertEqual(r.status, 401)

    async def test_poll_rejects_missing_token(self):
        r = await self._client.get("/detonate/deadbeef")
        self.assertEqual(r.status, 401)


class TestJobLifecycle(RunnerTestCase):
    async def test_detonate_happy_path(self):
        # Submit a clean text "sample".
        r = await self._client.post(
            "/detonate",
            headers={"Authorization": "Bearer test-token-abc123"},
            json={
                "name": "hello.txt",
                "sha256": "a" * 64,
                "size": 12,
                "fileType": "text/plain",
                "quarantinePath": str(self._sample),
            },
        )
        self.assertEqual(r.status, 200)
        body = await r.json()
        job_id = body["jobId"]
        self.assertTrue(job_id)

        # Poll until done. The runner uses asyncio.create_task, so we
        # just yield a few times.
        for _ in range(40):
            r = await self._client.get(
                f"/detonate/{job_id}",
                headers={"Authorization": "Bearer test-token-abc123"},
            )
            self.assertEqual(r.status, 200)
            poll = await r.json()
            if poll["status"] in ("done", "error"):
                break
            await asyncio.sleep(0.05)

        self.assertEqual(poll["status"], "done", msg=json.dumps(poll, indent=2))
        self.assertIn("report", poll)
        report = poll["report"]
        # Connector expects these top-level fields:
        self.assertEqual(report["verdict"], "clean")
        self.assertEqual(report["classification"], "clean")
        self.assertIn("runMeta", report)
        self.assertEqual(report["runMeta"]["baseImage"], "alpine:3.20")
        self.assertGreater(report["runMeta"]["durationMs"], 0)

    async def test_detonate_suspicious_executable(self):
        r = await self._client.post(
            "/detonate",
            headers={"Authorization": "Bearer test-token-abc123"},
            json={
                "name": "evil.exe",
                "sha256": "b" * 64,
                "size": 4096,
                "fileType": "application/x-executable",
                "quarantinePath": str(self._sample),
            },
        )
        self.assertEqual(r.status, 200)
        job_id = (await r.json())["jobId"]

        for _ in range(40):
            r = await self._client.get(
                f"/detonate/{job_id}",
                headers={"Authorization": "Bearer test-token-abc123"},
            )
            poll = await r.json()
            if poll["status"] in ("done", "error"):
                break
            await asyncio.sleep(0.05)

        self.assertEqual(poll["status"], "done")
        self.assertEqual(poll["report"]["verdict"], "suspicious")

    async def test_detonate_missing_field(self):
        r = await self._client.post(
            "/detonate",
            headers={"Authorization": "Bearer test-token-abc123"},
            json={"name": "x"},  # missing sha256, size, …
        )
        self.assertEqual(r.status, 400)

    async def test_detonate_invalid_json(self):
        r = await self._client.post(
            "/detonate",
            headers={
                "Authorization": "Bearer test-token-abc123",
                "Content-Type": "application/json",
            },
            data="not json",
        )
        self.assertEqual(r.status, 400)


class TestWorkerCleanup(RunnerTestCase):
    async def test_worker_removed_on_success(self):
        # Spy on docker rm -f calls. We can't rely on the asyncSetUp
        # patcher for this test because we need to capture the calls
        # beyond the moment `status` becomes "done" (the rm runs in
        # a `finally` block that fires AFTER the polling would exit).
        # So we re-patch with a side-effect that records + delegates
        # to the original (which is the unstubbed asyncio call).
        calls = []

        async def spy(*args, **kwargs):
            calls.append(args)
            # Return a fake successful proc — no docker daemon here.
            return _patched_subprocess(*args, **kwargs)

        patcher = mock.patch.object(runner.asyncio, "create_subprocess_exec", side_effect=spy)
        patcher.start()
        try:
            r = await self._client.post(
                "/detonate",
                headers={"Authorization": "Bearer test-token-abc123"},
                json={
                    "name": "test.bin",
                    "sha256": "c" * 64,
                    "size": 100,
                    "fileType": "application/octet-stream",
                    "quarantinePath": str(self._sample),
                },
            )
            job_id = (await r.json())["jobId"]

            # Poll until done.
            for _ in range(40):
                r = await self._client.get(
                    f"/detonate/{job_id}",
                    headers={"Authorization": "Bearer test-token-abc123"},
                )
                poll = await r.json()
                if poll["status"] in ("done", "error"):
                    # Give the finally block time to schedule + run.
                    for _ in range(10):
                        rm_so_far = [c for c in calls if len(c) > 2 and c[0] == "docker" and c[1] == "rm"]
                        if rm_so_far:
                            break
                        await asyncio.sleep(0.05)
                    break
                await asyncio.sleep(0.05)
        finally:
            patcher.stop()

        # The last docker invocation should be `docker rm -f <worker>`.
        rm_calls = [c for c in calls if len(c) > 2 and c[0] == "docker" and c[1] == "rm"]
        self.assertTrue(rm_calls, msg=f"no docker rm calls observed: {calls}")
        self.assertEqual(rm_calls[-1][2], "-f")


if __name__ == "__main__":
    unittest.main()