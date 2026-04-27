"""Products router — paginated product listing + per-product timeline + detail.

Listing uses keyset pagination on `step_product_id` ASC. Aggregates
(`change_count`, `last_change_date`) are fetched as correlated scalar
subqueries so the planner only computes them for the (limit+1) products in
the current window — not the whole table per request, which is what the
old GROUP BY across the full join was doing.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models import (
    ChangeRecord, Product, ProductName, AttributeValue, MultiValue,
    Reference, Classification, User,
)
from app.schemas import ProductOut, ChangeRecordOut
from app.schemas.schemas import (
    ProductDetail, ProductAttributeRow, ProductReferenceRow,
    ProductListResponse,
)
from app.services.pagination import decode_cursor, encode_cursor


router = APIRouter(prefix="/api/v1/products", tags=["products"])


@router.get("", response_model=ProductListResponse)
def list_products(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    search: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    base = db.query(Product)

    if search:
        needle = f"%{search}%"
        base = base.filter(or_(
            Product.step_product_id.ilike(needle),
            Product.parent_id.ilike(needle),
            Product.user_type_id.ilike(needle),
        ))

    cur = decode_cursor(cursor)
    if cur and "p" in cur:
        base = base.filter(Product.step_product_id > cur["p"])

    rows = (
        base.order_by(Product.step_product_id.asc())
            .limit(limit + 1)
            .all()
    )
    has_more = len(rows) > limit
    page_rows = rows[:limit]

    # Per-product aggregates over the loaded window only — bounded work even
    # when the products table grows past 100k.
    pids = [p.step_product_id for p in page_rows]
    stats: dict[str, tuple[int, Optional[object]]] = {}
    if pids:
        agg = (
            db.query(
                ChangeRecord.step_product_id,
                func.count(ChangeRecord.id),
                func.max(ChangeRecord.change_date),
            )
            .filter(ChangeRecord.step_product_id.in_(pids))
            .group_by(ChangeRecord.step_product_id)
            .all()
        )
        stats = {pid: (cnt, last) for pid, cnt, last in agg}

    items = []
    for p in page_rows:
        cnt, last = stats.get(p.step_product_id, (0, None))
        items.append(ProductOut(
            step_product_id=p.step_product_id,
            parent_id=p.parent_id,
            user_type_id=p.user_type_id,
            change_count=cnt,
            last_change_date=last,
        ))

    next_cursor = (
        encode_cursor({"p": page_rows[-1].step_product_id})
        if has_more and page_rows else None
    )
    return ProductListResponse(
        has_more=has_more, next_cursor=next_cursor, items=items,
    )


@router.get("/{product_id}", response_model=ProductDetail)
def product_detail(product_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = db.query(Product).filter_by(step_product_id=product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    names = [
        {"qualifier_id": n.qualifier_id, "name_text": n.name_text}
        for n in db.query(ProductName).filter_by(step_product_id=product_id).all()
    ]

    # Per-attribute change stats — used to render audit-trail hints in UI
    change_stats = {
        attr_id: (cnt, last)
        for attr_id, cnt, last in db.query(
            ChangeRecord.attribute_id,
            func.count(ChangeRecord.id),
            func.max(ChangeRecord.change_date),
        )
        .filter(ChangeRecord.step_product_id == product_id)
        .filter(ChangeRecord.attribute_id.isnot(None))
        .group_by(ChangeRecord.attribute_id)
        .all()
    }

    attrs: list[ProductAttributeRow] = []
    for av in db.query(AttributeValue).filter_by(step_product_id=product_id).all():
        cnt, last = change_stats.get(av.attribute_id, (0, None))
        attrs.append(ProductAttributeRow(
            attribute_id=av.attribute_id, qualifier_id=av.qualifier_id,
            unit_id=av.unit_id, lov_id=av.lov_id, value_text=av.value_text,
            kind="single", change_count=cnt or 0, last_change_date=last,
        ))
    for mv in db.query(MultiValue).filter_by(step_product_id=product_id).all():
        cnt, last = change_stats.get(mv.attribute_id, (0, None))
        attrs.append(ProductAttributeRow(
            attribute_id=mv.attribute_id, qualifier_id=mv.qualifier_id,
            values_json=mv.values_json, kind="multi",
            change_count=cnt or 0, last_change_date=last,
        ))

    refs = [
        ProductReferenceRow(
            ref_type=r.ref_type, target_product_id=r.target_product_id,
            qualifier_id=r.qualifier_id, suppressed=bool(r.suppressed),
        )
        for r in db.query(Reference).filter_by(step_product_id=product_id).all()
    ]
    classes = [
        c.classification_id for c in
        db.query(Classification).filter_by(step_product_id=product_id).all()
    ]

    total_changes, last_change = db.query(
        func.count(ChangeRecord.id), func.max(ChangeRecord.change_date)
    ).filter(ChangeRecord.step_product_id == product_id).one()

    return ProductDetail(
        step_product_id=p.step_product_id, parent_id=p.parent_id, user_type_id=p.user_type_id,
        names=names, attributes=attrs, references=refs, classifications=classes,
        change_count=total_changes or 0, last_change_date=last_change,
    )


@router.get("/{product_id}/timeline", response_model=list[ChangeRecordOut])
def product_timeline(
    product_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
):
    rows = (db.query(ChangeRecord)
              .filter_by(step_product_id=product_id)
              .order_by(ChangeRecord.change_date.desc(), ChangeRecord.id.desc())
              .limit(limit)
              .all())
    return [ChangeRecordOut.model_validate(r) for r in rows]
