"""Shared FastAPI dependencies: current-user resolution and CSRF enforcement."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import User
from .security import ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, decode_token


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    user = await db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account unavailable")
    return user


def require_csrf(request: Request) -> None:
    """Double-submit CSRF check for state-changing requests.

    The auth cookie is SameSite=Strict (primary defense). This header/cookie
    comparison is defense-in-depth and also blocks same-site sub-resource abuse.
    """
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get(CSRF_HEADER)
    if not cookie or not header or not _consteq(cookie, header):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF validation failed")


def _consteq(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a.encode(), b.encode())
