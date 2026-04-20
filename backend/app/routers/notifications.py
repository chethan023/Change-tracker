"""Notifications router — CRUD for notification rules."""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models import ChangeRecord, NotificationRule, ChangeElementType, User
from app.schemas import (
    NotificationRuleCreate,
    NotificationRuleOut,
    NotificationFilterOptions,
)


router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


def _validate_types(types: list[str]) -> list[str]:
    out = []
    for t in types:
        try:
            out.append(ChangeElementType(t).value)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid change_element_type: {t}")
    return out


def _dedupe(xs: Optional[list[str]]) -> Optional[list[str]]:
    if not xs:
        return None
    seen, out = set(), []
    for x in xs:
        if x and x not in seen:
            seen.add(x); out.append(x)
    return out or None


@router.get("", response_model=list[NotificationRuleOut])
def list_rules(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(NotificationRule).filter_by(user_id=user.id).all()


@router.post("", response_model=NotificationRuleOut, status_code=201)
def create_rule(
    body: NotificationRuleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.notify_channel not in ("email", "slack"):
        raise HTTPException(status_code=422, detail="notify_channel must be email|slack")

    # Legacy scalar → list fold (so old clients still work)
    cet_list = body.change_element_types or (
        [body.change_element_type] if body.change_element_type else None
    )
    attr_list = body.attribute_ids or (
        [body.attribute_id] if body.attribute_id else None
    )
    qual_list = body.qualifier_ids or (
        [body.qualifier_id] if body.qualifier_id else None
    )

    cet_list = _validate_types(cet_list) if cet_list else None

    rule = NotificationRule(
        user_id=user.id,
        rule_name=body.rule_name,
        # Keep legacy scalar mirrors populated when exactly one value selected
        change_element_type=ChangeElementType(cet_list[0]) if cet_list and len(cet_list) == 1 else None,
        attribute_id=attr_list[0] if attr_list and len(attr_list) == 1 else None,
        qualifier_id=qual_list[0] if qual_list and len(qual_list) == 1 else None,
        change_element_types=_dedupe(cet_list),
        attribute_ids=_dedupe(attr_list),
        qualifier_ids=_dedupe(qual_list),
        ref_types=_dedupe(body.ref_types),
        target_ids=_dedupe(body.target_ids),
        notify_channel=body.notify_channel,
        notify_target=body.notify_target,
    )
    db.add(rule); db.commit(); db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rule = db.query(NotificationRule).filter_by(id=rule_id, user_id=user.id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule); db.commit()


# ── Dependent filter options ───────────────────────────────────────
# Returns distinct attribute_ids / qualifier_ids / ref_types / target_ids
# filtered to values that are *semantically valid* for the selected change
# types. If the user selects e.g. REFERENCE_ADDED only, attribute_ids
# returns [] (field doesn't apply); if they select ATTRIBUTE_VALUE,
# attribute_ids returns every distinct attribute_id ever observed on an
# attribute-carrying change. This avoids the empty-result problem that
# occurs when we over-filter by exact (type, value) combinations.

# Types whose ChangeRecord rows carry an attribute_id / qualifier_id.
_ATTRIBUTE_TYPES = {
    "ATTRIBUTE_VALUE",
    "MULTIVALUE_CHANGED",
    "CONTAINER_VALUE",
}
# Types whose rows carry ref_type / target_id.
_REFERENCE_TYPES = {
    "REFERENCE_ADDED", "REFERENCE_REMOVED", "REFERENCE_SUPPRESSED",
    "ASSET_LINKED", "ASSET_UNLINKED", "ASSET_SUPPRESSED",
    "CLASSIFICATION_LINKED", "CLASSIFICATION_UNLINKED",
}


@router.get("/filter-options", response_model=NotificationFilterOptions)
def filter_options(
    change_element_types: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    types = [t for t in (change_element_types or []) if t]
    if types:
        types = _validate_types(types)

    # When no types are selected, all categories are valid.
    attr_types = (set(types) & _ATTRIBUTE_TYPES) if types else _ATTRIBUTE_TYPES
    ref_types_sel = (set(types) & _REFERENCE_TYPES) if types else _REFERENCE_TYPES

    def _distinct(col, restrict_to: set[str], limit: Optional[int] = None):
        if not restrict_to:
            return []
        q = (
            db.query(distinct(col))
              .filter(ChangeRecord.change_element_type.in_(restrict_to))
              .filter(col.isnot(None))
        )
        rows = sorted({r[0] for r in q.all() if r[0] is not None})
        return rows[:limit] if limit else rows

    return NotificationFilterOptions(
        change_element_types=[t.value for t in ChangeElementType],
        attribute_ids=_distinct(ChangeRecord.attribute_id, attr_types, 1000),
        qualifier_ids=_distinct(ChangeRecord.qualifier_id, attr_types),
        ref_types=_distinct(ChangeRecord.ref_type, ref_types_sel),
        target_ids=_distinct(ChangeRecord.target_id, ref_types_sel, 1000),
    )
