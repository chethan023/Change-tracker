"""
Changes router — /api/v1/changes

Main query endpoint backing the React dashboard grid.
Supports filtering, pagination, and CSV export.
"""
from datetime import datetime
from typing import Optional
import csv
import time

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import distinct, or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user, get_current_user_flex
from app.models import ChangeRecord, User
from app.schemas import ChangeRecordOut, ChangeListResponse, FilterOptions


router = APIRouter(prefix="/api/v1", tags=["changes"])


def _apply_filters(query, **f):
    """Attach WHERE clauses to a ChangeRecord query for each provided filter."""
    if f.get("step_product_id"):
        query = query.filter(ChangeRecord.step_product_id == f["step_product_id"])
    if f.get("change_element_type"):
        query = query.filter(ChangeRecord.change_element_type == f["change_element_type"])
    if f.get("attribute_id"):
        query = query.filter(ChangeRecord.attribute_id == f["attribute_id"])
    if f.get("qualifier_id"):
        query = query.filter(ChangeRecord.qualifier_id == f["qualifier_id"])
    if f.get("changed_by"):
        query = query.filter(ChangeRecord.changed_by == f["changed_by"])
    if f.get("snapshot_week"):
        query = query.filter(ChangeRecord.snapshot_week == f["snapshot_week"])
    if f.get("date_from"):
        query = query.filter(ChangeRecord.change_date >= f["date_from"])
    if f.get("date_to"):
        query = query.filter(ChangeRecord.change_date <= f["date_to"])
    if f.get("search"):
        needle = f"%{f['search']}%"
        query = query.filter(or_(
            ChangeRecord.step_product_id.ilike(needle),
            ChangeRecord.attribute_id.ilike(needle),
            ChangeRecord.current_value.ilike(needle),
            ChangeRecord.previous_value.ilike(needle),
        ))
    return query


@router.get("/changes", response_model=ChangeListResponse)
def list_changes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    step_product_id: Optional[str] = None,
    change_element_type: Optional[str] = None,
    attribute_id: Optional[str] = None,
    qualifier_id: Optional[str] = None,
    changed_by: Optional[str] = None,
    snapshot_week: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    base = db.query(ChangeRecord)
    base = _apply_filters(
        base,
        step_product_id=step_product_id, change_element_type=change_element_type,
        attribute_id=attribute_id, qualifier_id=qualifier_id, changed_by=changed_by,
        snapshot_week=snapshot_week, date_from=date_from, date_to=date_to, search=search,
    )

    # Only run COUNT(*) on page 1 — on a multi-million-row table the count
    # dominates latency and clients drive pagination via has_more anyway.
    total: Optional[int] = base.count() if page == 1 else None

    # Fetch one extra row to detect whether another page exists without
    # paying for a second query.
    rows = (
        base.order_by(ChangeRecord.change_date.desc(), ChangeRecord.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size + 1)
            .all()
    )
    has_more = len(rows) > page_size
    items = rows[:page_size]

    return ChangeListResponse(
        total=total,
        page=page,
        page_size=page_size,
        has_more=has_more,
        items=[ChangeRecordOut.model_validate(i) for i in items],
    )


@router.get("/changes/{change_id}", response_model=ChangeRecordOut)
def get_change(change_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.query(ChangeRecord).filter_by(id=change_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Change record not found")
    return ChangeRecordOut.model_validate(row)


# ── Filter options cache ────────────────────────────────────────────
# Filter dropdown values change only on snapshot ingest, so we serve them
# from a process-local cache with a short TTL. `bust_filter_options_cache`
# is called from the ingest flow when a new snapshot completes.
_FILTER_OPTIONS_CACHE: dict = {"value": None, "expires_at": 0.0}
_FILTER_OPTIONS_TTL_SECONDS = 300


def bust_filter_options_cache() -> None:
    _FILTER_OPTIONS_CACHE["value"] = None
    _FILTER_OPTIONS_CACHE["expires_at"] = 0.0


def _compute_filter_options(db: Session) -> FilterOptions:
    def distinct_col(col):
        return [x[0] for x in db.query(distinct(col)).all() if x[0] is not None]

    return FilterOptions(
        change_element_types=sorted(distinct_col(ChangeRecord.change_element_type)),
        attribute_ids=sorted(distinct_col(ChangeRecord.attribute_id))[:500],
        qualifier_ids=sorted(distinct_col(ChangeRecord.qualifier_id)),
        snapshot_weeks=sorted(distinct_col(ChangeRecord.snapshot_week), reverse=True),
        changed_by=sorted(distinct_col(ChangeRecord.changed_by)),
        product_ids=sorted(distinct_col(ChangeRecord.step_product_id))[:1000],
    )


@router.get("/filters/options", response_model=FilterOptions)
def filter_options(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return all distinct values that populate the UI dropdowns."""
    now = time.monotonic()
    cached = _FILTER_OPTIONS_CACHE["value"]
    if cached is not None and now < _FILTER_OPTIONS_CACHE["expires_at"]:
        return cached

    opts = _compute_filter_options(db)
    _FILTER_OPTIONS_CACHE["value"] = opts
    _FILTER_OPTIONS_CACHE["expires_at"] = now + _FILTER_OPTIONS_TTL_SECONDS
    return opts


@router.get("/export/csv")
def export_csv(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_flex),
    step_product_id: Optional[str] = None,
    change_element_type: Optional[str] = None,
    attribute_id: Optional[str] = None,
    qualifier_id: Optional[str] = None,
    changed_by: Optional[str] = None,
    snapshot_week: Optional[str] = None,
    search: Optional[str] = None,
):
    if user.role not in ("admin", "editor", "steward"):
        raise HTTPException(status_code=403, detail="Export requires editor access")
    base = db.query(ChangeRecord)
    base = _apply_filters(
        base,
        step_product_id=step_product_id, change_element_type=change_element_type,
        attribute_id=attribute_id, qualifier_id=qualifier_id, changed_by=changed_by,
        snapshot_week=snapshot_week, search=search,
    )
    query = base.order_by(ChangeRecord.change_date.desc()).limit(50_000)

    header = [
        "change_date", "change_element_type", "step_product_id",
        "attribute_id", "qualifier_id", "unit_id",
        "previous_value", "current_value",
        "ref_type", "target_id", "step_container_id",
        "changed_by", "snapshot_week",
    ]

    def iter_csv():
        # Stream row-by-row so memory stays O(1) and TTFB is near-instant
        # regardless of result-set size. yield_per keeps the cursor server-side.
        import io as _io
        buf = _io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(header)
        yield buf.getvalue()
        buf.seek(0); buf.truncate(0)

        for r in query.yield_per(1000):
            writer.writerow([
                r.change_date.isoformat() if r.change_date else "",
                r.change_element_type.value if hasattr(r.change_element_type, "value") else r.change_element_type,
                r.step_product_id, r.attribute_id or "", r.qualifier_id or "", r.unit_id or "",
                r.previous_value or "", r.current_value or "",
                r.ref_type or "", r.target_id or "", r.step_container_id or "",
                r.changed_by or "", r.snapshot_week or "",
            ])
            yield buf.getvalue()
            buf.seek(0); buf.truncate(0)

    return StreamingResponse(
        iter_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=change_tracker_export.csv"},
    )
