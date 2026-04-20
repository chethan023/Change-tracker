"""Changes API — listing, filtering, pagination, CSV export."""
from datetime import datetime, timedelta

import pytest

from app.models import ChangeRecord, ChangeElementType, Snapshot


@pytest.fixture
def seeded_changes(db_session):
    snap = Snapshot(file_hash="abc", status="completed", snapshot_week="2024-W14")
    db_session.add(snap); db_session.flush()

    base = datetime(2024, 4, 1, 12, 0)
    rows = [
        ChangeRecord(
            change_element_type=ChangeElementType.ATTRIBUTE_VALUE,
            step_product_id="PROD-001", attribute_id="Thickness",
            previous_value="80", current_value="100",
            change_date=base, snapshot_week="2024-W14", snapshot_id=snap.id,
            changed_by="editor.one",
        ),
        ChangeRecord(
            change_element_type=ChangeElementType.PRODUCT_CREATED,
            step_product_id="PROD-002",
            change_date=base + timedelta(hours=1), snapshot_week="2024-W14",
            snapshot_id=snap.id, changed_by="editor.two",
        ),
        ChangeRecord(
            change_element_type=ChangeElementType.REFERENCE_ADDED,
            step_product_id="PROD-001", ref_type="RelatedAccessory",
            target_id="PROD-ACC-001",
            change_date=base + timedelta(hours=2), snapshot_week="2024-W15",
            snapshot_id=snap.id, changed_by="editor.one",
        ),
    ]
    db_session.add_all(rows); db_session.commit()
    return rows


def test_list_changes_returns_all(client, admin_headers, seeded_changes):
    res = client.get("/api/v1/changes", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3


def test_list_changes_filter_by_product(client, admin_headers, seeded_changes):
    res = client.get("/api/v1/changes?step_product_id=PROD-001", headers=admin_headers)
    assert res.json()["total"] == 2


def test_list_changes_filter_by_week(client, admin_headers, seeded_changes):
    res = client.get("/api/v1/changes?snapshot_week=2024-W15", headers=admin_headers)
    assert res.json()["total"] == 1


def test_list_changes_pagination(client, admin_headers, seeded_changes):
    res = client.get("/api/v1/changes?page=1&page_size=2", headers=admin_headers)
    body = res.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["page"] == 1


def test_list_changes_sorted_desc(client, admin_headers, seeded_changes):
    res = client.get("/api/v1/changes", headers=admin_headers)
    dates = [i["change_date"] for i in res.json()["items"]]
    assert dates == sorted(dates, reverse=True)


def test_filter_options_returns_distinct_values(client, admin_headers, seeded_changes):
    res = client.get("/api/v1/filters/options", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert "ATTRIBUTE_VALUE" in body["change_element_types"]
    assert "PROD-001" in body["product_ids"]
    assert "2024-W14" in body["snapshot_weeks"]


def test_csv_export_via_header_auth(client, admin_headers, seeded_changes):
    res = client.get("/api/v1/export/csv", headers=admin_headers)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    text = res.text
    assert "change_date,change_element_type" in text.splitlines()[0]
    assert "PROD-001" in text


def test_csv_export_via_query_token_works(client, seed_users, seeded_changes):
    """Regression: <a href> download can't set Authorization header, so /export/csv
    must also accept a `_t=<token>` query param."""
    login = client.post("/api/v1/auth/login",
                        json={"email": "admin@example.com", "password": "AdminPw1!"})
    token = login.json()["access_token"]
    # No Authorization header — token goes in query string
    res = client.get(f"/api/v1/export/csv?_t={token}")
    assert res.status_code == 200
    assert "PROD-001" in res.text


def test_csv_export_without_any_token_rejected(client, seeded_changes):
    res = client.get("/api/v1/export/csv")
    assert res.status_code == 401
