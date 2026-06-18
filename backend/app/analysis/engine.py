"""Analysis job orchestration.

Runs as an asyncio background task. State (progress, stage lines, final report)
is persisted to the DB after each step, so any worker process can serve the
polling endpoint regardless of which one is running the job.
"""
from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker

from ..config import get_settings
from ..models import Analysis
from .sandbox import get_sandbox
from .scoring import ScoreResult, score_features
from .seed_data import KNOWN_BY_SHA, to_report
from .static_analysis import StaticFeatures, analyze_file

_NAME_RE = re.compile(r"[^A-Za-z0-9]+")


def _now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _feats_from_text(text: str) -> StaticFeatures:
    """Fallback features for URL submissions when byte-fetch is disabled."""
    digest = hashlib.sha256(text.encode("utf-8", "ignore")).hexdigest()
    urls = [text] if text.lower().startswith("http") else []
    return StaticFeatures(
        size=len(text), sha256=digest, md5=hashlib.md5(text.encode()).hexdigest(),  # noqa: S324
        file_type="Remote URL reference", entropy=0.0, urls=urls,
    )


def _display_name(source_name: str, sha: str) -> str:
    stem = Path(source_name or "").stem
    cleaned = _NAME_RE.sub("", stem).upper()
    return cleaned[:24] if cleaned else f"SAMPLE-{sha[:8].upper()}"


def _verdict(score: int) -> str:
    if score >= 65:
        return "Malicious"
    if score >= 40:
        return "Suspicious"
    return "Likely benign"


def _stage_lines(feats: StaticFeatures) -> list[str]:
    packed = "packed/encrypted" if feats.entropy >= 7.2 else "no packer detected"
    return [
        f"Hashing sample — SHA-256 {feats.sha256[:16]}…",
        f"File type: {feats.file_type} · {feats.size_human}",
        f"Static triage: {len(feats.suspicious_apis)} suspicious APIs, entropy {feats.entropy} ({packed})",
        "Detonating in isolated sandbox" if get_settings() else "Detonating",
        "Hooking kernel and userland API calls",
        f"Behavioral capture: {len(feats.urls)} URL(s), {len(feats.ips)} IP(s) observed",
        "Mapping observations to MITRE ATT&CK",
        "Scoring threat · generating report",
    ]


def _assemble(analysis: Analysis, feats: StaticFeatures, score: ScoreResult, behavioral: dict) -> dict:
    name = _display_name(analysis.source_name, feats.sha256)
    hot_tiles = [
        {"l": "Suspicious APIs", "v": str(len(feats.suspicious_apis)), "hot": len(feats.suspicious_apis) > 0},
        {"l": "Embedded URLs/IPs", "v": str(len(feats.urls) + len(feats.ips)), "hot": bool(feats.urls or feats.ips)},
        {"l": "Entropy", "v": f"{feats.entropy}", "hot": feats.entropy >= 7.2},
    ]
    meta_tiles = [
        {"l": "MITRE tactics", "v": str(len(behavioral["killchain"])), "hot": False},
        {"l": "Techniques", "v": str(sum(len(k["techniques"]) for k in behavioral["killchain"])), "hot": False},
        {"l": "Behavioral events", "v": str(len(behavioral["timeline"])), "hot": False},
    ]
    tagline = f"{score.classification}. {len(feats.suspicious_apis)} suspicious APIs, entropy {feats.entropy}."
    summary = (
        f"Heuristic static analysis of {analysis.source_name or 'the submitted sample'} "
        f"({feats.file_type}, {feats.size_human}). Threat score {score.score}/100 "
        f"({score.label}). Signals: " + (", ".join(score.reasons[:5]) or "none notable") + ". "
        "Behavioral sections below are synthesized from static evidence — connect a real "
        "sandbox engine for live detonation data."
    )
    return {
        "id": analysis.id,
        "name": name,
        "file": analysis.source_name or feats.sha256[:16],
        "sha": feats.sha256,
        "type": feats.file_type,
        "size": feats.size_human,
        "seen": _now_str(),
        "classification": score.classification,
        "verdict": _verdict(score.score),
        "confidence": score.confidence,
        "severity": score.score,
        "sevLevel": score.level,
        "sevLabel": score.label,
        "tagline": tagline,
        "summary": summary,
        "synthetic": True,
        "tiles": meta_tiles + hot_tiles,
        "factors": score.factors,
        "killchain": behavioral["killchain"],
        "timeline": behavioral["timeline"],
        "blast": behavioral["blast"],
        "network": behavioral["network"],
    }


async def run_analysis(analysis_id: str, sm: async_sessionmaker) -> None:
    settings = get_settings()
    delay = max(0.0, settings.analysis_stage_seconds)
    try:
        # Compute features (real, off the event loop) first.
        async with sm() as db:
            analysis = await db.get(Analysis, analysis_id)
            if analysis is None:
                return
            analysis.status = "analyzing"
            analysis.progress = 0
            analysis.stage_lines = []
            await db.commit()
            stored_path = analysis.stored_path
            source_name = analysis.source_name
            source_url = analysis.source_url

        if stored_path and Path(stored_path).exists():
            feats = await asyncio.to_thread(analyze_file, stored_path)
        else:
            feats = _feats_from_text(source_url or source_name or analysis_id)

        score = score_features(feats)
        lines = _stage_lines(feats)

        # Animate progress through the stages.
        for i, line in enumerate(lines, start=1):
            async with sm() as db:
                analysis = await db.get(Analysis, analysis_id)
                if analysis is None:
                    return
                analysis.stage_lines = lines[:i]
                analysis.progress = min(100, round(i / len(lines) * 100))
                analysis.sha256 = feats.sha256
                analysis.file_size = feats.size
                analysis.file_type = feats.file_type
                await db.commit()
            if delay:
                await asyncio.sleep(delay)

        # Resolve the report: known canonical sample, or heuristic synthesis.
        known = KNOWN_BY_SHA.get(feats.sha256)
        if known:
            report = to_report(known, synthetic=False, report_id=analysis_id)
        else:
            sandbox = get_sandbox("demo")
            sample_path = Path(stored_path) if stored_path else Path(".")
            behavioral = await asyncio.to_thread(
                lambda: sandbox.detonate(sample_path, feats, score, display=source_name or "sample")
            )
            report = _assemble_safe(analysis_id, source_name, source_url, feats, score, behavioral)

        async with sm() as db:
            analysis = await db.get(Analysis, analysis_id)
            if analysis is None:
                return
            analysis.report = report
            analysis.status = "completed"
            analysis.progress = 100
            await db.commit()

    except Exception as exc:  # noqa: BLE001 - record failure, never crash the worker
        async with sm() as db:
            analysis = await db.get(Analysis, analysis_id)
            if analysis is not None:
                analysis.status = "failed"
                analysis.error = f"{type(exc).__name__}: {exc}"[:500]
                await db.commit()


def _assemble_safe(analysis_id, source_name, source_url, feats, score, behavioral) -> dict:
    # Build a lightweight Analysis-like shim for _assemble's field access.
    shim = Analysis(id=analysis_id, source_name=source_name or "", source_url=source_url)
    return _assemble(shim, feats, score, behavioral)
