"""Products router — product listing + per-product timeline + detail."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
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
)


router = APIRouter(prefix="/api/v1/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db), user: User = Depends(get_current_user), limit: int = 500):
    # Aggregate change counts per product
    q = (
        db.query(
            Product.step_product_id, Product.parent_id, Product.user_type_id,
            func.count(ChangeRecord.id).label("change_count"),
            func.max(ChangeRecord.change_date).label("last_change_date"),
        )
        .outerjoin(ChangeRecord, ChangeRecord.step_product_id == Product.step_product_id)
        .group_by(Product.step_product_id, Product.parent_id, Product.user_type_id)
        .order_by(func.max(ChangeRecord.change_date).desc().nullslast())
        .limit(limit)
    )
    return [
        ProductOut(
            step_product_id=pid, parent_id=parent, user_type_id=utype,
            change_count=count, last_change_date=lastc,
        )
        for pid, parent, utype, count, lastc in q.all()
    ]


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
def product_timeline(product_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (db.query(ChangeRecord)
              .filter_by(step_product_id=product_id)
              .order_by(ChangeRecord.change_date.desc()).all())
    return [ChangeRecordOut.model_validate(r) for r in rows]
