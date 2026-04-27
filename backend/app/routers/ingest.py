"""
Ingest router — /api/v1/ingest

Accepts STEPXML from the STIBO STEP OIE webhook.
Validates API key, streams body to disk (so concurrent multi-MB uploads
don't pin memory), dedupes by file hash, creates a Snapshot row,
enqueues the Celery task with the file *path*, returns HTTP 202.
"""
import hashlib
import os
import tempfile

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import require_api_key
from app.models import Snapshot
from app.schemas import IngestResponse


router = APIRouter(prefix="/api/v1", tags=["ingest"])


# Per-file safety cap. STEPXML payloads expected ≤ 250 MB; reject larger.
MAX_BODY_BYTES = 256 * 1024 * 1024
INGEST_SPOOL_DIR = os.environ.get("INGEST_SPOOL_DIR") or tempfile.gettempdir()


_XML_CONTENT_TYPES = {
    "application/xml",
    "text/xml",
    "application/atom+xml",
}


@router.post(
    "/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_api_key)],
)
async def ingest(request: Request, db: Session = Depends(get_db)):
    """
    Receive a STEPXML payload from STIBO STEP OIE.

    Streams the body to a temp file (chunked), computing the SHA-256 as
    bytes arrive. Never holds the full payload in memory.
    """
    # Validate Content-Type so non-XML payloads are rejected before reading
    # the body. STEP sends application/xml; some proxies use text/xml.
    ct = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ct and ct not in _XML_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported Media Type: expected application/xml or text/xml, got '{ct}'",
        )
    os.makedirs(INGEST_SPOOL_DIR, exist_ok=True)
    sha = hashlib.sha256()
    total = 0
    fd, tmp_path = tempfile.mkstemp(prefix="stepxml-", suffix=".xml", dir=INGEST_SPOOL_DIR)
    try:
        with os.fdopen(fd, "wb") as fh:
            async for chunk in request.stream():
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_BODY_BYTES:
                    raise HTTPException(status_code=413, detail="Payload too large")
                sha.update(chunk)
                fh.write(chunk)
    except HTTPException:
        _safe_unlink(tmp_path)
        raise
    except Exception:
        _safe_unlink(tmp_path)
        raise

    if total == 0:
        _safe_unlink(tmp_path)
        raise HTTPException(status_code=400, detail="Empty payload")

    file_hash = sha.hexdigest()

    existing = db.query(Snapshot).filter_by(file_hash=file_hash).first()
    if existing:
        _safe_unlink(tmp_path)
        return IngestResponse(
            message="Duplicate payload — already processed",
            snapshot_id=existing.id,
            file_hash=file_hash,
        )

    snap = Snapshot(file_hash=file_hash, status="queued")
    db.add(snap)
    db.commit()
    db.refresh(snap)

    from workers.tasks import process_ingest_task
    process_ingest_task.delay(snap.id, tmp_path)

    return IngestResponse(
        message="Ingest job queued",
        snapshot_id=snap.id,
        file_hash=file_hash,
    )


def _safe_unlink(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass
