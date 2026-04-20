"""Products API — listing + detail with attribute audit counts."""
from datetime import datetime

import pytest

from app.models import (
    Product, ProductName, AttributeValue, MultiValue,
    Reference, Classification, ChangeRecord, ChangeElementType,
)


@pytest.fixture
def seeded_product(db_session):
    p = Product(step_product_id="PROD-001", parent_id="FAMILY-A", user_type_id="WallPanel")
    db_session.add(p)
    db_session.add(ProductName(step_product_id="PROD-001", qualifier_id="en",
                               name_text="Wall Panel"))
    db_session.add(AttributeValue(step_product_id="PROD-001", attribute_id="Thickness",
                                  unit_id="mm", value_text="100"))
    db_session.add(MultiValue(step_product_id="PROD-001",
                              attribute_id="ApplicableCertifications",
                              values_json=["CE", "EN-13501-1"]))
    db_session.add(Reference(step_product_id="PROD-001", ref_type="RelatedAccessory",
                             target_product_id="PROD-ACC-001"))
    db_session.add(Classification(step_product_id="PROD-001",
                                  classification_id="FIRE_RATED_PANELS"))
    db_session.add(ChangeRecord(
        change_element_type=ChangeElementType.ATTRIBUTE_VALUE,
        step_product_id="PROD-001", attribute_id="Thickness",
        previous_value="80", current_value="100",
        change_date=datetime(2024, 4, 1),
    ))
    db_session.commit()
    return p


def test_list_products(client, admin_headers, seeded_product):
    res = client.get("/api/v1/products", headers=admin_headers)
    assert res.status_code == 200
    ids = [p["step_product_id"] for p in res.json()]
    assert "PROD-001" in ids


def test_product_detail_returns_full_payload(client, admin_headers, seeded_product):
    res = client.get("/api/v1/products/PROD-001", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["step_product_id"] == "PROD-001"
    assert body["user_type_id"] == "WallPanel"
    assert any(a["attribute_id"] == "Thickness" for a in body["attributes"])
    assert any(a["kind"] == "multi" for a in body["attributes"])
    assert any(r["ref_type"] == "RelatedAccessory" for r in body["references"])
    assert "FIRE_RATED_PANELS" in body["classifications"]


def test_product_detail_includes_change_count_per_attribute(client, admin_headers, seeded_product):
    res = client.get("/api/v1/products/PROD-001", headers=admin_headers)
    thickness = next(a for a in res.json()["attributes"] if a["attribute_id"] == "Thickness")
    assert thickness["change_count"] == 1


def test_product_detail_unknown_returns_404(client, admin_headers):
    res = client.get("/api/v1/products/DOES-NOT-EXIST", headers=admin_headers)
    assert res.status_code == 404


def test_product_timeline_returns_changes(client, admin_headers, seeded_product):
    res = client.get("/api/v1/products/PROD-001/timeline", headers=admin_headers)
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["attribute_id"] == "Thickness"
