"""Sample submission and analysis retrieval."""
from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..analysis.engine import run_analysis
from ..config import get_settings
from ..db import get_db, get_sessionmaker
from ..deps import get_current_user, require_csrf
from ..models import Analysis, User
from ..schemas import AnalysisOut, AnalysisSummary, UrlSubmit

router = APIRouter(prefix="/api/analyses", tags=["analyses"])

# Keep strong references to background tasks so they are not garbage-collected.
_TASKS: set[asyncio.Task] = set()

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
_CHUNK = 1024 * 1024
_URL_RE = re.compile(r"^https?://[^\s/$.?#].[^\s]*$", re.IGNORECASE)


def _safe_filename(name: str) -> str:
    base = os.path.basename(name or "").strip() or "sample.bin"
    base = _SAFE_NAME.sub("_", base)
    return base[:200]


def _spawn(analysis_id: str) -> None:
    task = asyncio.create_task(run_analysis(analysis_id, get_sessionmaker()))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)


def _to_summary(a: Analysis) -> AnalysisSummary:
    r = a.report
    if a.status == "completed" and r:
        return AnalysisSummary(
            id=a.id, status=a.status, name=r["name"], seen=r["seen"],
            classification=r["classification"], sevLabel=r["sevLabel"],
            sevLevel=r["sevLevel"], score=r["severity"], summary=r["tagline"],
            is_sample=a.is_sample,
        )
    label = {"queued": "QUEUED", "analyzing": "ANALYZING", "failed": "FAILED"}.get(a.status, a.status.upper())
    return AnalysisSummary(
        id=a.id, status=a.status,
        name=(a.source_name or "Pending sample")[:64],
        seen=a.created_at.strftime("%Y-%m-%d %H:%M UTC"),
        classification="Analysis in progress" if a.status != "failed" else "Analysis failed",
        sevLabel=label, sevLevel="info", score=a.progress,
        summary=a.error or "Detonation in progress…", is_sample=a.is_sample,
    )


@router.get("", response_model=list[AnalysisSummary])
async def list_analyses(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[AnalysisSummary]:
    # Samples first, then newest analyses. Non-admins see only their own
    # analyses plus the shared reference samples (object-level authorization).
    stmt = select(Analysis).order_by(Analysis.is_sample.desc(), Analysis.created_at.desc()).limit(200)
    if not user.is_admin:
        stmt = stmt.where(or_(Analysis.owner_id == user.id, Analysis.is_sample.is_(True)))
    rows = (await db.scalars(stmt)).all()
    return [_to_summary(a) for a in rows]


@router.get("/{analysis_id}", response_model=AnalysisOut)
async def get_analysis(
    analysis_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Analysis:
    a = await db.get(Analysis, analysis_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    # Scope to owner (samples are shared; admins may read anything). 404 — not
    # 403 — so existence of another user's analysis isn't confirmed.
    if not a.is_sample and a.owner_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    return a


@router.post(
    "/file",
    response_model=AnalysisOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def submit_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Analysis:
    settings = get_settings()
    safe_name = _safe_filename(file.filename or "sample.bin")

    analysis = Analysis(owner_id=user.id, source_kind="file", source_name=safe_name, status="queued")
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    # Stream to quarantine with a hard size cap. The blob is stored opaque
    # (no executable bit, random name) and is never run.
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / f"{analysis.id}.bin"
    total = 0
    try:
        with open(dest, "wb") as out:
            while chunk := await file.read(_CHUNK):
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    out.close()
                    dest.unlink(missing_ok=True)
                    await db.delete(analysis)
                    await db.commit()
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        f"File exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB limit",
                    )
                out.write(chunk)
        os.chmod(dest, 0o600)
    except HTTPException:
        raise
    except Exception:
        dest.unlink(missing_ok=True)
        await db.delete(analysis)
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not store uploaded file")

    if total == 0:
        dest.unlink(missing_ok=True)
        await db.delete(analysis)
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file")

    analysis.stored_path = str(dest)
    analysis.file_size = total
    await db.commit()
    await db.refresh(analysis)

    _spawn(analysis.id)
    return analysis


@router.post(
    "/url",
    response_model=AnalysisOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def submit_url(
    payload: UrlSubmit,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Analysis:
    url = payload.url.strip()
    if not _URL_RE.match(url):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Enter a valid http(s) URL")
    name = (url.split("/")[-1].split("?")[0]) or url
    analysis = Analysis(
        owner_id=user.id, source_kind="url", source_name=name[:200], source_url=url, status="queued"
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)
    _spawn(analysis.id)
    return analysis


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
async def delete_analysis(
    analysis_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    a = await db.get(Analysis, analysis_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    if a.is_sample:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seeded samples cannot be deleted")
    if a.owner_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    if a.stored_path:
        Path(a.stored_path).unlink(missing_ok=True)
    await db.delete(a)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
