"""Database initialization and idempotent seeding (admin + reference samples)."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update

from .analysis.seed_data import SEED_SAMPLES, to_report
from .config import get_settings
from .db import Base, get_engine, get_sessionmaker
from .models import Analysis, User
from .security import hash_password

log = logging.getLogger("detonate.seed")


async def init_db(retries: int = 30, delay: float = 2.0) -> None:
    """Create tables, waiting for the database to accept connections."""
    engine = get_engine()
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            log.info("Database schema ready")
            return
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            log.warning("DB not ready (attempt %s/%s): %s", attempt, retries, exc)
            await asyncio.sleep(delay)
    raise RuntimeError(f"Database unavailable after {retries} attempts") from last_exc


async def seed_samples() -> None:
    sm = get_sessionmaker()
    async with sm() as db:
        for sample in SEED_SAMPLES:
            existing = await db.get(Analysis, sample["id"])
            report = to_report(sample, synthetic=False)
            if existing:
                # Keep the reference reports current with the shipped data.
                existing.report = report
                existing.status = "completed"
                existing.progress = 100
                existing.is_sample = True
            else:
                db.add(
                    Analysis(
                        id=sample["id"],
                        owner_id=None,
                        status="completed",
                        progress=100,
                        stage_lines=[],
                        source_kind="sample",
                        source_name=sample["file"],
                        sha256=sample["sha"],
                        file_type=sample["type"],
                        is_sample=True,
                        report=report,
                    )
                )
        await db.commit()
    log.info("Seeded %d reference samples", len(SEED_SAMPLES))


async def seed_admin() -> None:
    settings = get_settings()
    if not (settings.admin_email and settings.admin_password):
        return
    sm = get_sessionmaker()
    async with sm() as db:
        email = settings.admin_email.lower()
        exists = await db.scalar(select(func.count()).select_from(User).where(User.email == email))
        if exists:
            return
        db.add(
            User(
                email=email,
                password_hash=hash_password(settings.admin_password),
                is_admin=True,
            )
        )
        await db.commit()
        log.info("Bootstrap admin account created: %s", email)


async def reconcile_orphans(stale_seconds: int = 120) -> None:
    """Fail analyses left mid-flight by a crashed/recycled worker.

    Jobs run as in-process tasks tied to the worker that accepted them, so a
    worker restart can strand a row in 'queued'/'analyzing' forever. We only
    fail rows untouched for ``stale_seconds`` — an actively-progressing job
    bumps ``updated_at`` every stage, so this never kills a live job running in
    a sibling worker during a rolling restart. (A dedicated task queue is the
    production-grade answer; see docs/ARCHITECTURE.md.)
    """
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=stale_seconds)
    sm = get_sessionmaker()
    async with sm() as db:
        result = await db.execute(
            update(Analysis)
            .where(
                Analysis.status.in_(["queued", "analyzing"]),
                Analysis.updated_at < cutoff,
            )
            .values(
                status="failed",
                error="Interrupted — the analysis worker restarted. Re-submit to retry.",
            )
        )
        await db.commit()
    if result.rowcount:
        log.info("Reconciled %d orphaned analyses", result.rowcount)


async def bootstrap() -> None:
    await init_db()
    await reconcile_orphans()
    await seed_samples()
    await seed_admin()
