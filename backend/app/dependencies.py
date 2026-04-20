"""Shared FastAPI dependencies: DB session, current user, API key guard."""
from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.models import User
from app.services.auth import decode_access_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def _resolve_user(token: str | None, db: Session) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter_by(id=int(payload["sub"])).first()
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_api_key(x_api_key: str = Header(None)) -> None:
    """Guard for the /ingest endpoint — validates X-API-Key header."""
    if not x_api_key or x_api_key != settings.INGEST_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


def _enforce_password_change(user: User) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=403,
            detail="password_change_required",
        )
    return user


def get_current_user_pending(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Returns user even if a password change is pending — use ONLY on /auth/change-password."""
    return _resolve_user(token, db)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Guard for UI endpoints — validates JWT and rejects users who must change password."""
    return _enforce_password_change(_resolve_user(token, db))


def get_current_user_flex(
    token: str = Depends(oauth2_scheme),
    _t: str | None = Query(None),
    db: Session = Depends(get_db),
) -> User:
    """Accepts JWT via Authorization header OR `_t` query param (for download links)."""
    return _enforce_password_change(_resolve_user(token or _t, db))


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_editor(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("admin", "editor", "steward"):
        raise HTTPException(status_code=403, detail="Editor access required")
    return user
