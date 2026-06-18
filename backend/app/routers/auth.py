"""Authentication: register, login, logout, current user."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user, require_csrf
from ..models import User
from ..schemas import LoginRequest, RegisterRequest, UserOut
from ..security import (
    clear_auth_cookies,
    create_access_token,
    hash_password,
    new_csrf_token,
    set_auth_cookies,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Simple in-process login throttle (defense-in-depth; nginx also rate-limits).
_MAX_FAILS = 5
_LOCK_SECONDS = 300
_fails: dict[str, tuple[int, float]] = {}


def _throttle_key(request: Request, email: str) -> str:
    ip = request.client.host if request.client else "?"
    return f"{ip}:{email.lower()}"


def _check_lock(key: str) -> None:
    count, until = _fails.get(key, (0, 0.0))
    if count >= _MAX_FAILS and time.monotonic() < until:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed attempts. Try again later.",
        )


def _record_fail(key: str) -> None:
    count, _ = _fails.get(key, (0, 0.0))
    _fails[key] = (count + 1, time.monotonic() + _LOCK_SECONDS)


def _clear_fail(key: str) -> None:
    _fails.pop(key, None)


def _issue_session(response: Response, user: User) -> None:
    token = create_access_token(user.id)
    csrf = new_csrf_token()
    set_auth_cookies(response, token, csrf)


@router.get("/config")
async def auth_config() -> dict:
    s = get_settings()
    return {"app_name": s.app_name, "allow_registration": s.allow_registration}


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)
) -> User:
    settings = get_settings()
    if not settings.allow_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is disabled")

    email = payload.email.lower()
    exists = await db.scalar(select(func.count()).select_from(User).where(User.email == email))
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    # First registered user becomes admin if no admin exists yet.
    admin_count = await db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True)))
    user = User(email=email, password_hash=hash_password(payload.password), is_admin=admin_count == 0)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    _issue_session(response, user)
    return user


@router.post("/login", response_model=UserOut)
async def login(
    payload: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> User:
    key = _throttle_key(request, payload.email)
    _check_lock(key)

    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        _record_fail(key)
        # Uniform error — do not reveal whether the email exists.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    _clear_fail(key)
    _issue_session(response, user)
    return user


@router.post("/logout", dependencies=[Depends(require_csrf)])
async def logout(response: Response, _: User = Depends(get_current_user)) -> dict:
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
