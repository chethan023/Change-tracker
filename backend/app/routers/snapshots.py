"""Snapshots router — ingest history + monitoring."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models import Snapshot, User
from app.schemas import SnapshotOut


router = APIRouter(prefix="/api/v1/snapshots", tags=["snapshots"])


@router.get("", response_model=list[SnapshotOut])
def list_snapshots(db: Session = Depends(get_db), user: User = Depends(get_current_user), limit: int = 100):
    return (db.query(Snapshot)
              .order_by(Snapshot.received_at.desc())
              .limit(limit).all())


@router.get("/{snapshot_id}/raw", response_class=PlainTextResponse)
def get_snapshot_raw(
    snapshot_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    snap = db.query(Snapshot).filter_by(id=snapshot_id).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snap.stepxml_raw or ""
