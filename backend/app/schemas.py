"""Pydantic request/response models — the API contract."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ------------------------- Auth -------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    is_admin: bool


# ------------------------- Report sub-documents -------------------------
Level = Literal["critical", "high", "medium", "low", "info", "none"]


class Technique(BaseModel):
    id: str
    name: str
    desc: str


class KillchainStage(BaseModel):
    tactic: str
    id: str
    level: Level
    short: str
    plain: str
    techniques: list[Technique]


class TimelineEvent(BaseModel):
    t: float
    label: str
    detail: str
    level: Level


class BlastStat(BaseModel):
    n: Any  # number or pre-formatted string (e.g. "2.41 GB")
    t: str


class BlastLayer(BaseModel):
    key: str
    label: str
    sub: str
    level: Level
    stats: list[BlastStat]


class Factor(BaseModel):
    label: str
    on: bool
    level: Level


class Tile(BaseModel):
    l: str
    v: str
    hot: bool = True


class NetIP(BaseModel):
    ip: str
    role: str
    geo: str


class NetLog(BaseModel):
    t: str
    e: str


class Network(BaseModel):
    victim: str
    domain: str
    proto: str
    beacon: str
    exfil: str
    ja3: str
    ips: list[NetIP]
    log: list[NetLog]


class Report(BaseModel):
    """The full malware report rendered by the UI."""
    id: str
    name: str
    file: str
    sha: str
    type: str
    size: str
    seen: str
    classification: str
    verdict: str
    confidence: str
    severity: int
    sevLevel: Level
    sevLabel: str
    tagline: str
    summary: str
    synthetic: bool = False  # true when behavioral data is heuristic, not a real detonation
    tiles: list[Tile]
    factors: list[Factor]
    killchain: list[KillchainStage]
    timeline: list[TimelineEvent]
    blast: list[BlastLayer]
    network: Network


# ------------------------- Analysis envelope -------------------------
class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    status: str
    progress: int
    stage_lines: list[str]
    error: str | None
    source_kind: str
    source_name: str
    sha256: str | None
    file_size: int | None
    file_type: str | None
    is_sample: bool
    created_at: datetime
    report: Report | None


class AnalysisSummary(BaseModel):
    """Lightweight item for the import-screen library list."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    status: str
    name: str
    seen: str
    classification: str
    sevLabel: str
    sevLevel: str
    score: int
    summary: str
    is_sample: bool


class UrlSubmit(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
