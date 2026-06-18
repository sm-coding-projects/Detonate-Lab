"""Database models.

The rich analysis report is stored as a JSON document (``report``) so the schema
can evolve with the analysis engine without migrations. Identity and job-control
fields are first-class columns so they can be indexed and queried.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    analyses: Mapped[list["Analysis"]] = relationship(back_populates="owner")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    owner_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Job control
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False, index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stage_lines: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Provenance
    source_kind: Mapped[str] = mapped_column(String(16), default="file", nullable=False)  # file|url|sample
    source_name: Mapped[str] = mapped_column(String(512), default="", nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    stored_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Static facts (real, computed)
    sha256: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_type: Mapped[str | None] = mapped_column(String(128), nullable=True)

    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    # The full report document (see schemas.Report); null until completed.
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    owner: Mapped["User | None"] = relationship(back_populates="analyses")
