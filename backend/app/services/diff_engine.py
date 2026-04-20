"""
Diff Engine

Streams parsed STEPXML events, groups them per product, preloads that
product's current state in a handful of queries, runs the diff in
memory, then commits before moving to the next product. This bounds
both query count (per product, not per event) and memory (one product's
worth of state at a time).
"""
from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable, Dict, Any, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import (
    Product, ProductName, AttributeValue, MultiValue,
    Reference, AssetLink, Classification,
    DataContainer, ContainerValue,
    ChangeRecord, Snapshot, ChangeElementType,
)
from app.services.stepxml_parser import (
    parse_stepxml, parse_stepxml_stream,
    extract_modification_metadata,
    LAST_MOD_DATE_ATTR, LAST_MOD_USER_ATTR,
)


def iso_week(dt: datetime) -> str:
    iso = dt.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


# ── Per-product current-state cache ─────────────────────────────────
@dataclass
class ProductState:
    product: Optional[Product] = None
    names: Dict[Optional[str], ProductName] = field(default_factory=dict)
    attrs: Dict[Tuple, AttributeValue] = field(default_factory=dict)
    multis: Dict[Tuple, MultiValue] = field(default_factory=dict)
    refs: Dict[Tuple, Reference] = field(default_factory=dict)
    assets: Dict[Tuple, AssetLink] = field(default_factory=dict)
    classes: Dict[str, Classification] = field(default_factory=dict)
    containers: Dict[str, DataContainer] = field(default_factory=dict)
    container_values: Dict[Tuple, ContainerValue] = field(default_factory=dict)


def _preload_product_state(db: Session, pid: str) -> ProductState:
    state = ProductState()
    state.product = db.query(Product).filter_by(step_product_id=pid).first()
    for n in db.query(ProductName).filter_by(step_product_id=pid).all():
        state.names[n.qualifier_id] = n
    for a in db.query(AttributeValue).filter_by(step_product_id=pid).all():
        state.attrs[(a.attribute_id, a.qualifier_id, a.unit_id)] = a
    for m in db.query(MultiValue).filter_by(step_product_id=pid).all():
        state.multis[(m.attribute_id, m.qualifier_id)] = m
    for r in db.query(Reference).filter_by(step_product_id=pid).all():
        state.refs[(r.ref_type, r.target_product_id, r.qualifier_id)] = r
    for a in db.query(AssetLink).filter_by(step_product_id=pid).all():
        state.assets[(a.ref_type, a.asset_id, a.qualifier_id)] = a
    for c in db.query(Classification).filter_by(step_product_id=pid).all():
        state.classes[c.classification_id] = c
    container_ids: List[str] = []
    for dc in db.query(DataContainer).filter_by(step_product_id=pid).all():
        state.containers[dc.step_container_id] = dc
        container_ids.append(dc.step_container_id)
    if container_ids:
        for cv in (db.query(ContainerValue)
                     .filter(ContainerValue.step_container_id.in_(container_ids))
                     .all()):
            state.container_values[(cv.step_container_id, cv.attribute_id, cv.qualifier_id)] = cv
    return state


# ── Public entrypoints ──────────────────────────────────────────────
def process_snapshot_path(db: Session, snapshot: Snapshot, xml_path: str) -> None:
    """Stream-parse a STEPXML file from disk; commits per product."""
    snapshot.status = "processing"
    db.commit()
    try:
        with open(xml_path, "rb") as fh:
            _drive(db, snapshot, parse_stepxml_stream(fh))
        snapshot.status = "completed"
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        snapshot.status = "failed"
        snapshot.error_log = f"{type(exc).__name__}: {exc}"
        db.commit()
        raise


def process_snapshot(db: Session, snapshot: Snapshot, xml_bytes: bytes) -> None:
    """Backwards-compatible bytes entrypoint (used by tests / legacy callers)."""
    snapshot.status = "processing"
    db.commit()
    try:
        _drive(db, snapshot, parse_stepxml(xml_bytes))
        snapshot.status = "completed"
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        snapshot.status = "failed"
        snapshot.error_log = f"{type(exc).__name__}: {exc}"
        db.commit()
        raise


def _drive(db: Session, snapshot: Snapshot, events: Iterable[Dict[str, Any]]) -> None:
    """Group events by product as they stream in, then per-product diff + commit."""
    now = datetime.utcnow()
    week = iso_week(now)
    snapshot.snapshot_week = week
    snapshot.records_parsed = 0
    snapshot.records_changed = 0

    buffer: List[Dict[str, Any]] = []
    current_pid: Optional[str] = None

    for ev in events:
        snapshot.records_parsed += 1
        et = ev["change_element_type"]

        if et == "PRODUCT_DELETED":
            # Flush whatever's pending, then handle the delete on its own
            if buffer:
                snapshot.records_changed += _process_product(db, snapshot, week, now, current_pid, buffer)
                buffer = []
                current_pid = None
            snapshot.records_changed += _process_product(
                db, snapshot, week, now, ev["step_product_id"], [ev]
            )
            continue

        pid = ev.get("step_product_id")
        if pid != current_pid and buffer:
            snapshot.records_changed += _process_product(db, snapshot, week, now, current_pid, buffer)
            buffer = []
        current_pid = pid
        buffer.append(ev)

    if buffer:
        snapshot.records_changed += _process_product(db, snapshot, week, now, current_pid, buffer)


def _process_product(db: Session, snapshot: Snapshot, week: str, now: datetime,
                     pid: Optional[str], events: List[Dict[str, Any]]) -> int:
    if not pid:
        return 0
    state = _preload_product_state(db, pid)
    metadata = extract_modification_metadata(events).get(pid, {})
    changed_by = metadata.get("changed_by", "STEP")
    change_date = _parse_dt(metadata.get("change_date")) or now
    common = dict(snapshot=snapshot, week=week, changed_by=changed_by,
                  change_date=change_date)

    emitted = 0
    for ev in events:
        et = ev["change_element_type"]
        hint = ev.get("changed_hint", False)
        local = {**common, "changed_hint": hint}

        if et == "_PRODUCT_HEADER":
            emitted += _diff_header(db, state, ev, pid, local)
        elif et == "PRODUCT_DELETED":
            if state.product is not None:
                db.delete(state.product)
                state.product = None
            _record(db, ChangeElementType.PRODUCT_DELETED, pid, **local)
            emitted += 1
        elif et == "PRODUCT_NAME_CHANGED":
            emitted += _diff_name(db, state, ev, pid, local)
        elif et == "ATTRIBUTE_VALUE":
            emitted += _diff_attr(db, state, ev, pid, local)
        elif et == "MULTIVALUE_CHANGED":
            emitted += _diff_multi(db, state, ev, pid, local)
        elif et in ("REFERENCE_ADDED", "REFERENCE_REMOVED", "REFERENCE_SUPPRESSED"):
            emitted += _diff_reference(db, state, ev, pid, et, local)
        elif et in ("ASSET_LINKED", "ASSET_UNLINKED", "ASSET_SUPPRESSED"):
            emitted += _diff_asset(db, state, ev, pid, et, local)
        elif et in ("CLASSIFICATION_LINKED", "CLASSIFICATION_UNLINKED"):
            emitted += _diff_classification(db, state, ev, pid, et, local)
        elif et == "CONTAINER_ADDED":
            emitted += _diff_container_added(db, state, ev, pid, local)
        elif et == "CONTAINER_REMOVED":
            emitted += _diff_container_removed(db, state, ev, pid, local)
        elif et == "CONTAINER_VALUE":
            emitted += _diff_container_value(db, state, ev, pid, local)

    db.commit()
    return emitted


# ── Per-type diffs (cache-driven) ───────────────────────────────────
def _diff_header(db, state, ev, pid, common) -> int:
    emitted = 0
    if state.product is None:
        prod = Product(
            step_product_id=pid,
            parent_id=ev.get("parent_id"),
            user_type_id=ev.get("user_type_id"),
        )
        db.add(prod)
        db.flush()
        state.product = prod
        _record(db, ChangeElementType.PRODUCT_CREATED, pid, **common)
        return 1
    prod = state.product
    if ev.get("parent_id") and ev["parent_id"] != prod.parent_id:
        _record(db, ChangeElementType.PRODUCT_RECLASSIFIED, pid,
                previous_value=prod.parent_id, current_value=ev["parent_id"], **common)
        prod.parent_id = ev["parent_id"]
        emitted += 1
    if ev.get("user_type_id") and ev["user_type_id"] != prod.user_type_id:
        _record(db, ChangeElementType.PRODUCT_TYPE_CHANGED, pid,
                previous_value=prod.user_type_id, current_value=ev["user_type_id"], **common)
        prod.user_type_id = ev["user_type_id"]
        emitted += 1
    return emitted


def _diff_name(db, state, ev, pid, common) -> int:
    qid = ev.get("qualifier_id")
    new_val = ev.get("current_value") or ""
    row = state.names.get(qid)
    prev = row.name_text if row else None
    if prev == new_val:
        return 0
    if row:
        row.name_text = new_val
    else:
        row = ProductName(step_product_id=pid, qualifier_id=qid, name_text=new_val)
        db.add(row)
        state.names[qid] = row
    _record(db, ChangeElementType.PRODUCT_NAME_CHANGED, pid,
            qualifier_id=qid, current_value=new_val, previous_value=prev, **common)
    return 1


def _diff_attr(db, state, ev, pid, common) -> int:
    aid = ev.get("attribute_id")
    if aid in (LAST_MOD_DATE_ATTR, LAST_MOD_USER_ATTR):
        return 0
    qid = ev.get("qualifier_id")
    uid = ev.get("unit_id")
    lov = ev.get("lov_id")
    new_val = ev.get("current_value") or ""
    key = (aid, qid, uid)
    row = state.attrs.get(key)
    prev = row.value_text if row else None
    if prev == new_val:
        return 0
    if row:
        row.value_text = new_val
        row.lov_id = lov
    else:
        row = AttributeValue(step_product_id=pid, attribute_id=aid,
                             qualifier_id=qid, unit_id=uid, lov_id=lov,
                             value_text=new_val)
        db.add(row)
        state.attrs[key] = row
    _record(db, ChangeElementType.ATTRIBUTE_VALUE, pid,
            attribute_id=aid, qualifier_id=qid, unit_id=uid, lov_id=lov,
            current_value=new_val, previous_value=prev, **common)
    return 1


def _diff_multi(db, state, ev, pid, common) -> int:
    aid = ev.get("attribute_id"); qid = ev.get("qualifier_id")
    new_set = sorted(ev.get("current_values") or [])
    key = (aid, qid)
    row = state.multis.get(key)
    prev = sorted(row.values_json) if row and row.values_json else []
    if prev == new_set:
        return 0
    if row:
        row.values_json = new_set
    else:
        row = MultiValue(step_product_id=pid, attribute_id=aid, qualifier_id=qid,
                         values_json=new_set)
        db.add(row)
        state.multis[key] = row
    _record(db, ChangeElementType.MULTIVALUE_CHANGED, pid,
            attribute_id=aid, qualifier_id=qid,
            current_values=new_set, previous_values=prev, **common)
    return 1


def _diff_reference(db, state, ev, pid, et, common) -> int:
    rt = ev.get("ref_type"); tgt = ev.get("target_id"); qid = ev.get("qualifier_id")
    key = (rt, tgt, qid)
    row = state.refs.get(key)

    if et == "REFERENCE_ADDED":
        if row and not row.suppressed:
            return 0
        if row:
            row.suppressed = False
        else:
            row = Reference(step_product_id=pid, ref_type=rt, target_product_id=tgt,
                            qualifier_id=qid, suppressed=False)
            db.add(row); state.refs[key] = row
        _record(db, ChangeElementType.REFERENCE_ADDED, pid,
                ref_type=rt, target_id=tgt, qualifier_id=qid, **common)
        return 1
    if et == "REFERENCE_REMOVED":
        if row:
            db.delete(row); state.refs.pop(key, None)
        _record(db, ChangeElementType.REFERENCE_REMOVED, pid,
                ref_type=rt, target_id=tgt, qualifier_id=qid, **common)
        return 1
    if et == "REFERENCE_SUPPRESSED":
        if row and row.suppressed:
            return 0
        if row:
            row.suppressed = True
        else:
            row = Reference(step_product_id=pid, ref_type=rt, target_product_id=tgt,
                            qualifier_id=qid, suppressed=True)
            db.add(row); state.refs[key] = row
        _record(db, ChangeElementType.REFERENCE_SUPPRESSED, pid,
                ref_type=rt, target_id=tgt, qualifier_id=qid, **common)
        return 1
    return 0


def _diff_asset(db, state, ev, pid, et, common) -> int:
    rt = ev.get("ref_type"); aid = ev.get("target_id"); qid = ev.get("qualifier_id")
    key = (rt, aid, qid)
    row = state.assets.get(key)

    if et == "ASSET_LINKED":
        if row and not row.suppressed:
            return 0
        if row:
            row.suppressed = False
        else:
            row = AssetLink(step_product_id=pid, ref_type=rt, asset_id=aid,
                            qualifier_id=qid, suppressed=False)
            db.add(row); state.assets[key] = row
        _record(db, ChangeElementType.ASSET_LINKED, pid,
                ref_type=rt, target_id=aid, qualifier_id=qid, **common)
        return 1
    if et == "ASSET_UNLINKED":
        if row:
            db.delete(row); state.assets.pop(key, None)
        _record(db, ChangeElementType.ASSET_UNLINKED, pid,
                ref_type=rt, target_id=aid, qualifier_id=qid, **common)
        return 1
    if et == "ASSET_SUPPRESSED":
        if row and row.suppressed:
            return 0
        if row:
            row.suppressed = True
        else:
            row = AssetLink(step_product_id=pid, ref_type=rt, asset_id=aid,
                            qualifier_id=qid, suppressed=True)
            db.add(row); state.assets[key] = row
        _record(db, ChangeElementType.ASSET_SUPPRESSED, pid,
                ref_type=rt, target_id=aid, qualifier_id=qid, **common)
        return 1
    return 0


def _diff_classification(db, state, ev, pid, et, common) -> int:
    cid = ev.get("target_id")
    row = state.classes.get(cid)
    if et == "CLASSIFICATION_LINKED":
        if row and not row.suppressed:
            return 0
        if row:
            row.suppressed = False
        else:
            row = Classification(step_product_id=pid, classification_id=cid, suppressed=False)
            db.add(row); state.classes[cid] = row
        _record(db, ChangeElementType.CLASSIFICATION_LINKED, pid, target_id=cid, **common)
        return 1
    if et == "CLASSIFICATION_UNLINKED":
        if row:
            db.delete(row); state.classes.pop(cid, None)
        _record(db, ChangeElementType.CLASSIFICATION_UNLINKED, pid, target_id=cid, **common)
        return 1
    return 0


def _diff_container_added(db, state, ev, pid, common) -> int:
    cid = ev.get("step_container_id")
    if cid in state.containers:
        return 0
    ctype = ev.get("target_id")
    row = DataContainer(step_product_id=pid, step_container_id=cid, container_type=ctype)
    db.add(row); state.containers[cid] = row
    _record(db, ChangeElementType.CONTAINER_ADDED, pid,
            step_container_id=cid, target_id=ctype, **common)
    return 1


def _diff_container_removed(db, state, ev, pid, common) -> int:
    cid = ev.get("step_container_id")
    row = state.containers.pop(cid, None)
    if row:
        db.delete(row)
    # Remove any cached/persisted container values for this container
    for key in [k for k in state.container_values if k[0] == cid]:
        db.delete(state.container_values.pop(key))
    db.query(ContainerValue).filter_by(step_container_id=cid).delete()
    _record(db, ChangeElementType.CONTAINER_REMOVED, pid,
            step_container_id=cid, **common)
    return 1


def _diff_container_value(db, state, ev, pid, common) -> int:
    cid = ev.get("step_container_id")
    aid = ev.get("attribute_id"); qid = ev.get("qualifier_id")
    new_val = ev.get("current_value") or ""
    key = (cid, aid, qid)
    row = state.container_values.get(key)
    prev = row.value_text if row else None
    if prev == new_val:
        return 0
    if row:
        row.value_text = new_val
    else:
        row = ContainerValue(step_container_id=cid, attribute_id=aid,
                             qualifier_id=qid, value_text=new_val)
        db.add(row); state.container_values[key] = row
    _record(db, ChangeElementType.CONTAINER_VALUE, pid,
            step_container_id=cid, attribute_id=aid, qualifier_id=qid,
            current_value=new_val, previous_value=prev, **common)
    return 1


# ── Helpers ─────────────────────────────────────────────────────────
def _record(db, change_element_type, step_product_id,
            snapshot=None, week=None, changed_by="STEP",
            change_date=None, changed_hint=False, **kwargs):
    db.add(ChangeRecord(
        change_element_type=change_element_type,
        step_product_id=step_product_id,
        snapshot_id=snapshot.id if snapshot else None,
        snapshot_week=week,
        changed_by=changed_by,
        change_date=change_date or datetime.utcnow(),
        changed_hint=changed_hint,
        **kwargs,
    ))


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, TypeError):
        return None


def compute_file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
