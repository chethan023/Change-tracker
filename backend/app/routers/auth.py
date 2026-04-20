"""Auth router — /api/v1/auth/login."""
import time
from collections import defaultdict, deque
from datetime import datetime
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.dependencies import get_current_user_pending
from app.models import User
from app.schemas import LoginRequest, TokenResponse, ChangePasswordRequest
from app.services.auth import verify_password, hash_password, create_access_token


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


_WINDOW_SECONDS = 60
_attempts: dict[str, deque[float]] = defaultdict(deque)
_attempts_lock = Lock()


def _check_rate_limit(key: str) -> None:
    limit = settings.LOGIN_RATE_LIMIT_PER_MIN
    if limit <= 0:
        return
    now = time.monotonic()
    cutoff = now - _WINDOW_SECONDS
    with _attempts_lock:
        bucket = _attempts[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again shortly.")
        bucket.append(now)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(f"ip:{client_ip}")
    _check_rate_limit(f"user:{data.email.lower()}")

    user = db.query(User).filter_by(email=data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.active:
        raise HTTPException(status_code=403, detail="Account disabled")

    user.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token({"sub": str(user.id), "email": user.email, "role": user.role})
    return TokenResponse(
        access_token=token, user_id=user.id, email=user.email, role=user.role,
        must_change_password=bool(user.must_change_password),
    )


@router.post("/change-password", status_code=204)
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_pending),
):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="New password must differ from current password")
    user.hashed_password = hash_password(body.new_password)
    user.must_change_password = False
    db.commit()
