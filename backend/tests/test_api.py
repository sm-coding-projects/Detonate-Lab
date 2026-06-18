import asyncio

from httpx import ASGITransport, AsyncClient

from tests.conftest import csrf_headers


async def test_unauthenticated_is_rejected(client):
    r = await client.get("/api/analyses")
    assert r.status_code == 401


async def test_health(client):
    assert (await client.get("/api/health")).status_code == 200
    assert (await client.get("/api/health/ready")).status_code == 200


async def test_register_login_and_samples(client):
    r = await client.post("/api/auth/register", json={"email": "analyst@detonate.io", "password": "supersecure-123"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "analyst@detonate.io"
    assert body["is_admin"] is True  # first user becomes admin

    me = await client.get("/api/auth/me")
    assert me.status_code == 200

    lst = await client.get("/api/analyses")
    assert lst.status_code == 200
    names = {item["id"] for item in lst.json()}
    assert {"wraithlock", "ghostfeed"} <= names

    detail = await client.get("/api/analyses/wraithlock")
    assert detail.status_code == 200
    report = detail.json()["report"]
    assert report["severity"] == 94
    assert report["sevLabel"] == "CRITICAL"
    assert len(report["tiles"]) == 6


async def test_csrf_enforced_on_mutations(client):
    await client.post("/api/auth/register", json={"email": "triage@detonate.io", "password": "supersecure-123"})

    # Missing CSRF header -> rejected.
    bad = await client.post("/api/analyses/url", json={"url": "http://example.com/x.exe"})
    assert bad.status_code == 403

    # With CSRF header -> accepted.
    ok = await client.post(
        "/api/analyses/url",
        json={"url": "http://example.com/x.exe"},
        headers=csrf_headers(client),
    )
    assert ok.status_code == 201, ok.text
    aid = ok.json()["id"]

    # Poll until the background analysis completes.
    for _ in range(50):
        await asyncio.sleep(0.05)
        d = await client.get(f"/api/analyses/{aid}")
        if d.json()["status"] == "completed":
            break
    final = await client.get(f"/api/analyses/{aid}")
    data = final.json()
    assert data["status"] == "completed", data
    assert data["report"]["synthetic"] is True
    assert data["report"]["severity"] >= 0


async def test_tenant_isolation(client):
    """A user must not see another user's analyses (object-level authz)."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as cx,
        AsyncClient(transport=transport, base_url="http://test") as cy,
    ):
        rx = await cx.post("/api/auth/register", json={"email": "x@detonate.io", "password": "supersecure-123"})
        assert rx.status_code == 201, rx.text
        ry = await cy.post("/api/auth/register", json={"email": "y@detonate.io", "password": "supersecure-123"})
        assert ry.status_code == 201, ry.text
        # Y is never the first account, so Y is always a non-admin.
        assert ry.json()["is_admin"] is False

        ox = await cx.post(
            "/api/analyses/url", json={"url": "http://x-only.example/s.exe"}, headers=csrf_headers(cx)
        )
        assert ox.status_code == 201, ox.text
        xid = ox.json()["id"]

        # Y cannot read X's analysis (404, not 403 — no existence disclosure).
        assert (await cy.get(f"/api/analyses/{xid}")).status_code == 404

        # Y's library excludes X's analysis but still shows shared samples.
        listing = await cy.get("/api/analyses")
        ids = {i["id"] for i in listing.json()}
        assert xid not in ids
        assert "wraithlock" in ids

        # Let X's background job finish so it doesn't outlive the event loop.
        for _ in range(50):
            await asyncio.sleep(0.02)
            if (await cx.get(f"/api/analyses/{xid}")).json()["status"] in ("completed", "failed"):
                break
