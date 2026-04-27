"""Users router — admin-managed (max 10 per deployment)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.dependencies import get_current_user, get_current_user_pending, require_admin
from app.models import User
from app.schemas import UserCreate, UserOut, UserUpdate, AdminResetPasswordRequest
from app.services.auth import hash_password


router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return db.query(User).order_by(User.created_at).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if db.query(User).count() >= settings.MAX_USERS:
        raise HTTPException(status_code=403,
            detail=f"User limit of {settings.MAX_USERS} reached for this deployment")
    email = (body.email or "").strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=409, detail="Email already in use")

    u = User(
        email=email, role=body.role.value, step_user_id=body.step_user_id,
        hashed_password=hash_password(body.password),
        must_change_password=True,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    u = db.query(User).filter_by(id=user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.id == admin.id and body.role is not None and body.role.value != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    if u.id == admin.id and body.active is False:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    if body.role is not None:
        u.role = body.role.value
    if body.active is not None:
        u.active = body.active
    if body.step_user_id is not None:
        u.step_user_id = body.step_user_id
    db.commit(); db.refresh(u)
    return u


@router.post("/{user_id}/reset-password", status_code=204)
def admin_reset_password(
    user_id: int,
    body: AdminResetPasswordRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    u = db.query(User).filter_by(id=user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    from datetime import datetime, timezone
    u.hashed_password = hash_password(body.new_password)
    u.must_change_password = True
    u.tokens_invalidated_at = int(datetime.now(timezone.utc).timestamp()) + 1
    db.commit()


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    u = db.query(User).filter_by(id=user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.delete(u); db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user_pending)):
    """Returns the current user even if a password change is pending — frontend uses it after login."""
    return user
