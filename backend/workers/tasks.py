"""
Celery tasks.

process_ingest_task: fetches the Snapshot row, runs the diff engine,
then dispatches any notification rules that match the new change records.
"""
import logging
import os

from app.db.session import SessionLocal
from app.models import Snapshot, ChangeRecord
from app.services.diff_engine import process_snapshot_path
from app.services.notifier import dispatch_batch
from workers.celery_app import celery_app


logger = logging.getLogger(__name__)


@celery_app.task(name="process_ingest_task", bind=True, max_retries=2)
def process_ingest_task(self, snapshot_id: int, payload: str):
    """
    payload is the absolute path to the spooled STEPXML file written by
    the ingest router. The worker streams it through the diff engine and
    deletes it on success or terminal failure.
    """
    logger.info(f"Processing snapshot {snapshot_id} (path={payload})")
    db = SessionLocal()
    try:
        snap = db.query(Snapshot).filter_by(id=snapshot_id).first()
        if not snap:
            logger.error(f"Snapshot {snapshot_id} not found")
            return {"status": "not_found"}

        try:
            with open(payload, "rb") as fh:
                head = fh.read(200_000)
            snap.stepxml_raw = head.decode("utf-8", errors="replace")
            db.commit()
        except OSError:
            logger.warning("Could not capture raw payload head for snapshot %s", snapshot_id)

        process_snapshot_path(db, snap, payload)

        new_changes = db.query(ChangeRecord).filter_by(snapshot_id=snapshot_id).all()
        if new_changes:
            dispatch_batch(db, new_changes)

        logger.info(
            f"Snapshot {snapshot_id} complete: "
            f"{snap.records_parsed} parsed, {snap.records_changed} changed"
        )
        # New change_records mean the dropdown distinct sets may have grown.
        try:
            from app.routers.changes import bust_filter_options_cache
            bust_filter_options_cache()
        except Exception:
            logger.warning("Failed to bust filter options cache", exc_info=True)
        _safe_unlink(payload)
        return {
            "status": "completed",
            "snapshot_id": snapshot_id,
            "records_parsed": snap.records_parsed,
            "records_changed": snap.records_changed,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception(f"Snapshot {snapshot_id} failed")
        try:
            raise self.retry(exc=exc, countdown=10)
        except Exception:
            _safe_unlink(payload)
            raise
    finally:
        db.close()


def _safe_unlink(path: str) -> None:
    try:
        if path and os.path.exists(path):
            os.unlink(path)
    except OSError:
        pass
