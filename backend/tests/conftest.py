"""Test configuration — runs the app against a temporary SQLite database."""
import os
import tempfile

# Environment MUST be set before any app module is imported.
_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ.setdefault("DL_ENVIRONMENT", "development")
os.environ.setdefault("DL_SECRET_KEY", "test-secret-key-test-secret-key-0123456789")
os.environ.setdefault("DL_COOKIE_SECURE", "false")
os.environ.setdefault("DL_ANALYSIS_STAGE_SECONDS", "0")
os.environ.setdefault("DL_DATABASE_URL", f"sqlite+aiosqlite:///{_db.name}")
os.environ.setdefault("DL_UPLOAD_DIR", tempfile.mkdtemp(prefix="dl-quarantine-"))

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402


@pytest_asyncio.fixture
async def client():
    from app.main import app
    from app.seed import bootstrap

    await bootstrap()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def csrf_headers(client: AsyncClient) -> dict:
    token = client.cookies.get("dl_csrf")
    return {"x-csrf-token": token} if token else {}
