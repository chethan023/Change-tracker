"""Admin-only maintenance endpoints — retention cleanup + bulk reset.

Both endpoints are guarded by `require_admin`. Reset is double-gated by a
literal-string confirmation header so a stray admin click can't wipe the
audit log; the worker that produced the data is left untouched.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import require_admin
from app.models import ChangeRecord, Snapshot, User
from app.models.base_models import NotificationLog
from app.schemas.schemas import (
    RetentionRunRequest, RetentionRunResult,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# Defaults match the Settings → Retention dropdown.
DEFAULT_CHANGE_RECORDS_DAYS = 365   # "12 months (default)"
DEFAULT_RAW_XML_DAYS = 90           # "90 days (default)"

# Header value the client must send to confirm the destructive reset.
RESET_CONFIRMATION_TOKEN = "DELETE-ALL-CHANGES"


@router.post("/retention/run", response_model=RetentionRunResult)
def run_retention_cleanup(
    body: RetentionRunRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Hard-deletes change records older than `change_records_days` and
    clears `stepxml_raw` (but keeps the snapshot row) older than `raw_xml_days`.

    Returns how many rows were affected so the UI can surface the result.
    Idempotent: running again with no new old data is a no-op.
    """
    now = datetime.now(timezone.utc)
    cr_days = body.change_records_days
    xml_days = body.raw_xml_days
    cr_deleted = 0
    xml_cleared = 0
    cr_cutoff = None
    xml_cutoff = None

    # Each category is only cleaned when its days param was explicitly provided.
    # Omitting a param (or selecting "Forever" in the UI) skips that category.

    if cr_days is not None:
        cr_cutoff = now - timedelta(days=cr_days)
        # 1) Clear dependent notification_log rows first — the FK has no
        #    ON DELETE CASCADE so deleting change records first would violate
        #    the constraint and roll back the whole transaction.
        db.query(NotificationLog).filter(
            NotificationLog.change_record_id.in_(
                db.query(ChangeRecord.id).filter(ChangeRecord.change_date < cr_cutoff)
            )
        ).delete(synchronize_session=False)
        # 2) Delete old change records.
        cr_deleted = (
            db.query(ChangeRecord)
              .filter(ChangeRecord.change_date < cr_cutoff)
              .delete(synchronize_session=False)
        )

    if xml_days is not None:
        xml_cutoff = now - timedelta(days=xml_days)
        # 3) Clear the heavy stepxml_raw column; keep the snapshot row so
        #    audit metadata (status, hash, week) remains browseable.
        xml_cleared = (
            db.query(Snapshot)
              .filter(Snapshot.received_at < xml_cutoff)
              .filter(Snapshot.stepxml_raw.isnot(None))
              .update({Snapshot.stepxml_raw: None}, synchronize_session=False)
        )

    db.commit()
    return RetentionRunResult(
        change_records_deleted=cr_deleted,
        raw_xml_cleared=xml_cleared,
        cutoff_change_records=cr_cutoff,
        cutoff_raw_xml=xml_cutoff,
    )


@router.post("/reset-changes", status_code=204)
def reset_all_changes(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    x_confirm: str = Header("", alias="X-Confirm"),
):
    """Bulk-deletes every change record. Snapshot rows are kept so the audit
    log of *what was ingested* survives — only the parsed-out per-attribute
    deltas are wiped. Requires `X-Confirm: DELETE-ALL-CHANGES` to fire."""
    if x_confirm != RESET_CONFIRMATION_TOKEN:
        raise HTTPException(
            status_code=400,
            detail=(
                "Confirmation header missing — send "
                f"X-Confirm: {RESET_CONFIRMATION_TOKEN} to proceed."
            ),
        )
    # Clear dependent notification_log rows first — FK has no ON DELETE
    # CASCADE so the change_records delete would otherwise roll back.
    db.query(NotificationLog).delete(synchronize_session=False)
    db.query(ChangeRecord).delete(synchronize_session=False)
    db.commit()
