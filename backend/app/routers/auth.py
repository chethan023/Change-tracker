"""Auth router — /api/v1/auth/login."""
import hashlib
import logging
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.dependencies import get_current_user_pending, get_current_user
from app.models import User, PasswordResetToken
from app.schemas import (
    LoginRequest, TokenResponse, ChangePasswordRequest,
    ForgotPasswordRequest, ResetPasswordRequest, ForgotPasswordResponse,
)
from app.services.auth import verify_password, hash_password, create_access_token


logger = logging.getLogger(__name__)
RESET_TOKEN_TTL_MINUTES = 30

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# ── In-process rate limiter ───────────────────────────────────────────
# NOTE: This is per-process only. For multi-worker deployments use Redis.
# Keys are never explicitly deleted; _prune() evicts buckets idle >10 min
# to prevent unbounded memory growth on long-running instances.

_WINDOW_SECONDS = 60
_PRUNE_INTERVAL = 600     # prune stale buckets every 10 minutes
_STALE_AFTER    = 600     # consider a bucket stale after 10 minutes of inactivity
_last_prune     = time.monotonic()
_attempts: dict[str, deque[float]] = defaultdict(deque)
_attempts_lock  = Lock()


def _prune_stale_buckets(now: float) -> None:
    """Remove buckets that have had no activity in the last _STALE_AFTER seconds."""
    cutoff = now - _STALE_AFTER
    stale = [k for k, dq in _attempts.items() if not dq or dq[-1] < cutoff]
    for k in stale:
        del _attempts[k]


def _check_rate_limit(key: str) -> None:
    global _last_prune
    limit = settings.LOGIN_RATE_LIMIT_PER_MIN
    if limit <= 0:
        return
    now = time.monotonic()
    window_cutoff = now - _WINDOW_SECONDS
    with _attempts_lock:
        # Periodic prune to evict idle buckets and prevent memory growth
        if now - _last_prune > _PRUNE_INTERVAL:
            _prune_stale_buckets(now)
            _last_prune = now

        bucket = _attempts[key]
        while bucket and bucket[0] < window_cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again shortly.")
        bucket.append(now)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    email = (data.email or "").strip().lower()
    _check_rate_limit(f"ip:{client_ip}")
    _check_rate_limit(f"user:{email}")

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.active:
        raise HTTPException(status_code=403, detail="Account disabled")

    user.last_login = datetime.now(timezone.utc)
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
    user.tokens_invalidated_at = int(datetime.now(timezone.utc).timestamp()) + 1
    db.commit()


@router.post("/logout", status_code=204)
def logout(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_pending),
):
    """Server-side revocation: invalidates ALL existing tokens for this user."""
    user.tokens_invalidated_at = int(datetime.now(timezone.utc).timestamp()) + 1
    db.commit()


# ── Forgot / reset password ───────────────────────────────────────────

def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _build_reset_url(token: str, request: Request) -> str:
    # Prefer the explicit env override so reset links survive reverse proxies
    # that strip or rewrite the Origin header. Falls back to the browser-supplied
    # Origin header, then reconstructs from scheme + Host as a last resort.
    base = (
        settings.FRONTEND_URL.rstrip("/")
        or (request.headers.get("origin") or "").rstrip("/")
        or f"{request.url.scheme}://{request.headers.get('host', '').rstrip('/')}"
    )
    return f"{base}/reset-password?token={token}"


def _send_reset_email(to_addr: str, reset_url: str) -> None:
    """Best-effort email send. Returns silently if SMTP isn't configured."""
    if not settings.SMTP_HOST:
        return
    import smtplib
    from email.mime.text import MIMEText
    msg = MIMEText(
        f"Hello,\n\nWe received a password reset request for your "
        f"{settings.CLIENT_NAME} account. To set a new password, open:\n\n"
        f"{reset_url}\n\nThis link expires in {RESET_TOKEN_TTL_MINUTES} minutes "
        f"and can only be used once.\n\nIf you didn't request this, you can ignore this email.\n"
    )
    msg["Subject"] = f"[{settings.CLIENT_NAME}] Password reset"
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_addr
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAIL_FROM, [to_addr], msg.as_string())
    except Exception as e:  # noqa: BLE001
        logger.warning("Password reset email failed for %s: %s", to_addr, e)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Always returns 200 to avoid leaking which emails are registered."""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(f"forgot:{client_ip}")
    email = (body.email or "").strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not user.active:
        return ForgotPasswordResponse()

    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_reset_token(token),
        expires_at=now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
    ))
    db.commit()

    reset_url = _build_reset_url(token, request)
    _send_reset_email(user.email, reset_url)

    return ForgotPasswordResponse(
        reset_url=reset_url if not settings.SMTP_HOST else None,
    )


@router.post("/reset-password", status_code=204)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    th = _hash_reset_token(body.token)
    rec = db.query(PasswordResetToken).filter_by(token_hash=th).first()
    now = datetime.now(timezone.utc)
    # expires_at stored as naive UTC — compare without tzinfo to be safe
    expires = rec.expires_at.replace(tzinfo=None) if rec and rec.expires_at else None
    now_naive = now.replace(tzinfo=None)
    if not rec or rec.used_at is not None or (expires is not None and expires < now_naive):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = db.query(User).filter_by(id=rec.user_id).first()
    if not user or not user.active:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user.hashed_password = hash_password(body.new_password)
    user.must_change_password = False
    user.tokens_invalidated_at = int(now.timestamp()) + 1
    rec.used_at = now_naive
    db.commit()


@router.post("/refresh", response_model=TokenResponse)
def refresh(user: User = Depends(get_current_user)):
    """Re-issue a fresh access token for an authenticated, active user."""
    token = create_access_token({"sub": str(user.id), "email": user.email, "role": user.role})
    return TokenResponse(
        access_token=token, user_id=user.id, email=user.email, role=user.role,
        must_change_password=bool(user.must_change_password),
    )
