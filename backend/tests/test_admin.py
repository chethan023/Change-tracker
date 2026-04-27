"""Admin maintenance endpoints — retention cleanup + bulk reset."""
from datetime import datetime, timedelta

from app.models import ChangeRecord, Snapshot, ChangeElementType


def _seed_snapshot_and_changes(db, ages_days):
    """Insert one ChangeRecord per provided age (days). Returns the IDs."""
    ids = []
    snap = Snapshot(
        received_at=datetime.utcnow() - timedelta(days=max(ages_days) + 1),
        file_hash="seed-hash",
        status="completed",
        stepxml_raw="<step/>",
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    for age in ages_days:
        cr = ChangeRecord(
            change_element_type=ChangeElementType.ATTRIBUTE_VALUE,
            step_product_id="P-1",
            attribute_id="X",
            change_date=datetime.utcnow() - timedelta(days=age),
            snapshot_id=snap.id,
        )
        db.add(cr)
        db.commit()
        db.refresh(cr)
        ids.append(cr.id)
    return ids, snap.id


# ── Retention ────────────────────────────────────────────────────────
def test_retention_run_requires_admin(client, viewer_headers):
    res = client.post("/api/v1/admin/retention/run",
                      json={"change_records_days": 30},
                      headers=viewer_headers)
    assert res.status_code == 403


def test_retention_deletes_old_change_records(client, admin_headers, db_session):
    _seed_snapshot_and_changes(db_session, [400, 200, 10])

    res = client.post("/api/v1/admin/retention/run",
                      json={"change_records_days": 365, "raw_xml_days": 90},
                      headers=admin_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    # Only the 400-day-old record is past the 365 cutoff.
    assert body["change_records_deleted"] == 1
    # Snapshot is older than 90 days, so its raw XML gets cleared.
    assert body["raw_xml_cleared"] == 1

    # Verify state.
    remaining = db_session.query(ChangeRecord).count()
    assert remaining == 2
    snap = db_session.query(Snapshot).first()
    assert snap.stepxml_raw is None


def test_retention_validates_day_bounds(client, admin_headers):
    res = client.post("/api/v1/admin/retention/run",
                      json={"change_records_days": 1},
                      headers=admin_headers)
    assert res.status_code == 422


# ── Reset all changes ────────────────────────────────────────────────
def test_reset_requires_confirmation_header(client, admin_headers):
    res = client.post("/api/v1/admin/reset-changes", headers=admin_headers)
    assert res.status_code == 400
    assert "DELETE-ALL-CHANGES" in res.json()["detail"]


def test_reset_requires_admin(client, viewer_headers):
    res = client.post(
        "/api/v1/admin/reset-changes",
        headers={**viewer_headers, "X-Confirm": "DELETE-ALL-CHANGES"},
    )
    assert res.status_code == 403


def test_reset_wipes_change_records_keeps_snapshots(
    client, admin_headers, db_session,
):
    _seed_snapshot_and_changes(db_session, [10, 50, 200])
    assert db_session.query(ChangeRecord).count() == 3

    res = client.post(
        "/api/v1/admin/reset-changes",
        headers={**admin_headers, "X-Confirm": "DELETE-ALL-CHANGES"},
    )
    assert res.status_code == 204, res.text

    # Re-query in a fresh state — explicit expire so SQLAlchemy doesn't
    # serve us stale cached objects from the session.
    db_session.expire_all()
    assert db_session.query(ChangeRecord).count() == 0
    assert db_session.query(Snapshot).count() == 1  # snapshot row preserved
