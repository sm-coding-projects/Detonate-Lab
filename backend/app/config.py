"""Application configuration, loaded entirely from the environment.

Nothing secret is ever hard-coded. In production the app refuses to start with a
default/weak SECRET_KEY so an insecure instance can never be deployed by accident.
"""
from __future__ import annotations

import secrets
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# A sentinel the operator must NOT ship to production.
DEV_SECRET = "dev-insecure-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DL_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Core ---
    app_name: str = "Detonate Lab"
    environment: Literal["development", "production"] = "production"
    secret_key: str = DEV_SECRET

    # --- Database (async driver) ---
    database_url: str = "postgresql+asyncpg://detonate:detonate@db:5432/detonate"

    # --- Auth ---
    access_token_expire_minutes: int = 720  # 12h
    allow_registration: bool = True
    # Optional bootstrap admin, created on first start if both are set.
    admin_email: str | None = None
    admin_password: str | None = None

    # --- Cookies / CSRF ---
    cookie_secure: bool = True  # set false only for plain-HTTP local testing
    cookie_samesite: Literal["strict", "lax", "none"] = "strict"
    cookie_domain: str | None = None

    # --- Uploads / analysis ---
    upload_dir: str = "/data/quarantine"
    max_upload_bytes: int = 100 * 1024 * 1024  # 100 MB (matches the design)
    # Per-stage delay (seconds) for the detonation progress animation.
    analysis_stage_seconds: float = 0.45
    # Allow the URL-fetch submission path to actually download bytes.
    enable_url_fetch: bool = False
    url_fetch_timeout_seconds: float = 15.0

    # --- CORS (same-origin deploy keeps this empty) ---
    cors_origins: list[str] = Field(default_factory=list)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _enforce_prod_security(self) -> "Settings":
        if self.environment == "production":
            if self.secret_key in (DEV_SECRET, "", None):
                raise ValueError(
                    "DL_SECRET_KEY must be set to a strong unique value in production. "
                    "Generate one with: openssl rand -hex 32"
                )
            if len(self.secret_key) < 32:
                raise ValueError("DL_SECRET_KEY must be at least 32 characters in production.")
        return self

    @property
    def is_prod(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def new_secret() -> str:
    """Helper for tooling/tests."""
    return secrets.token_hex(32)
