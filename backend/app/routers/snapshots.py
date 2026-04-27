"""Snapshots router — ingest history + monitoring."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models import Snapshot, User
from app.schemas import SnapshotOut
from app.schemas.schemas import SnapshotListResponse
from app.services.pagination import decode_cursor, encode_cursor


router = APIRouter(prefix="/api/v1/snapshots", tags=["snapshots"])


@router.get("", response_model=SnapshotListResponse)
def list_snapshots(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    search: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Keyset pagination on (received_at DESC, id DESC).

    Note: `stepxml_raw` is intentionally excluded from this list view (the
    schema doesn't expose it). The raw payload is multi-MB per row and is
    served on-demand via /snapshots/{id}/raw.
    """
    base = db.query(Snapshot)

    if search:
        needle = f"%{search}%"
        # Snapshot IDs are integers; allow exact-prefix numeric match too.
        clauses = [
            Snapshot.file_hash.ilike(needle),
            Snapshot.snapshot_week.ilike(needle),
            Snapshot.status.ilike(needle),
        ]
        if search.isdigit():
            clauses.append(Snapshot.id == int(search))
        base = base.filter(or_(*clauses))

    cur = decode_cursor(cursor)
    if cur and "r" in cur and "i" in cur:
        try:
            cur_at = datetime.fromisoformat(cur["r"])
            cur_id = int(cur["i"])
            base = base.filter(
                or_(
                    Snapshot.received_at < cur_at,
                    and_(Snapshot.received_at == cur_at, Snapshot.id < cur_id),
                )
            )
        except (TypeError, ValueError):
            pass

    rows = (
        base.order_by(Snapshot.received_at.desc(), Snapshot.id.desc())
            .limit(limit + 1)
            .all()
    )
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = (
        encode_cursor({"r": items[-1].received_at.isoformat(), "i": items[-1].id})
        if has_more and items else None
    )
    return SnapshotListResponse(
        has_more=has_more, next_cursor=next_cursor,
        items=[SnapshotOut.model_validate(s) for s in items],
    )


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
