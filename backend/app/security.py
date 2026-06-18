"""Password hashing, JWT issuance, and auth/CSRF cookie helpers."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from fastapi import Response

from .config import get_settings

ACCESS_COOKIE = "dl_access"
CSRF_COOKIE = "dl_csrf"
CSRF_HEADER = "x-csrf-token"
ALGORITHM = "HS256"

# Argon2id — memory-hard, modern default. Using argon2-cffi directly avoids any
# dependency on the stdlib ``crypt`` module (removed in Python 3.13).
_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except Exception:
        return False


def create_access_token(subject: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_auth_cookies(response: Response, token: str, csrf: str) -> None:
    settings = get_settings()
    max_age = settings.access_token_expire_minutes * 60
    common = dict(
        max_age=max_age,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )
    # Access token: httpOnly so JS (and thus XSS) cannot read it.
    response.set_cookie(ACCESS_COOKIE, token, httponly=True, **common)
    # CSRF token: readable by the SPA so it can echo it back in a header
    # (double-submit-cookie pattern).
    response.set_cookie(CSRF_COOKIE, csrf, httponly=False, **common)


def clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    for name in (ACCESS_COOKIE, CSRF_COOKIE):
        response.delete_cookie(
            name,
            domain=settings.cookie_domain,
            path="/",
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,
        )
