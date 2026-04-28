"""
STEPXML parser for the STIBO STEP PIM schema.

Emits a stream of dicts, one per identifiable change event, covering
all 18 change_element_type values.

Schema assumptions (from PIM.xsd v2025.x):
    namespace = http://www.stibosystems.com/step
    root      = STEP-ProductInformation

Usage:
    from app.services.stepxml_parser import parse_stepxml
    for event in parse_stepxml(xml_bytes):
        ... # event is a dict ready for the diff_engine
"""
from __future__ import annotations

from typing import Iterator, Dict, Any, Optional, Union, IO
from lxml import etree


# Namespace-agnostic: {*} matches any namespace (including no namespace),
# so this parser handles both the sample XML (xmlns="http://www.stibosystems.com/step")
# and live STEP exports that declare no default namespace.
NS: dict = {}
PRODUCT_TAG = "{*}Product"
DELETE_PRODUCT_TAG = "{*}DeleteProduct"


def _make_safe_parser() -> etree.XMLParser:
    # XXE-safe streaming parser: no external entities, no DTD, no network.
    return etree.XMLParser(
        resolve_entities=False, no_network=True, load_dtd=False,
        dtd_validation=False, huge_tree=False,
    )


def parse_stepxml_stream(source: Union[str, IO[bytes]]) -> Iterator[Dict[str, Any]]:
    """
    Memory-bounded streaming parser. `source` is a filesystem path or a
    binary file-like object. Yields the same event dicts as parse_stepxml.

    Uses lxml.iterparse to emit Product elements as they close, then clears
    the element + its prior siblings so the resident DOM never grows past
    one product. Suitable for STEPXML payloads with thousands of products.
    """
    context = etree.iterparse(
        source,
        events=("end",),
        tag=(PRODUCT_TAG, DELETE_PRODUCT_TAG),
        resolve_entities=False, no_network=True, load_dtd=False,
        huge_tree=False, recover=False,
    )

    context_id: Optional[str] = None
    try:
        for _event, el in context:
            # Lazy: read root's ContextID once, the first time we see any element
            if context_id is None:
                root = el.getroottree().getroot()
                context_id = root.get("ContextID")

            local = etree.QName(el.tag).localname
            if local == "Product":
                yield from _parse_product(el, context_id)
            elif local == "DeleteProduct":
                yield {
                    "change_element_type": "PRODUCT_DELETED",
                    "step_product_id": el.get("ID"),
                    "context_id": context_id,
                }

            # Drop the parsed element + its preceding siblings to bound memory.
            el.clear(keep_tail=True)
            parent = el.getparent()
            if parent is not None:
                while el.getprevious() is not None:
                    del parent[0]
    finally:
        del context


def parse_stepxml(xml_bytes: bytes) -> Iterator[Dict[str, Any]]:
    """
    Yields atomic change event dicts.

    Each event dict contains:
        change_element_type  : one of the ChangeElementType enum strings
        step_product_id      : the product the change belongs to (or None for root-level deletes)
        plus event-specific fields (attribute_id, value, ref_type, target_id, etc.)
    """
    # Backwards-compatible bytes entrypoint: stream from an in-memory buffer.
    from io import BytesIO
    yield from parse_stepxml_stream(BytesIO(xml_bytes))


def _parse_product(product, context_id: Optional[str]) -> Iterator[Dict[str, Any]]:
    pid = product.get("ID")
    parent_id = product.get("ParentID")
    user_type = product.get("UserTypeID")
    changed_hint = product.get("Changed") == "true"

    # Base product-level event (for PRODUCT_CREATED / RECLASSIFIED / TYPE_CHANGED
    # detection — the diff engine compares these fields to the DB)
    yield {
        "change_element_type": "_PRODUCT_HEADER",
        "step_product_id": pid,
        "parent_id": parent_id,
        "user_type_id": user_type,
        "changed_hint": changed_hint,
        "context_id": context_id,
    }

    # Names (multi-language)
    for name_el in product.findall("{*}Name"):
        yield {
            "change_element_type": "PRODUCT_NAME_CHANGED",
            "step_product_id": pid,
            "qualifier_id": name_el.get("QualifierID"),
            "current_value": (name_el.text or "").strip(),
            "changed_hint": name_el.get("Changed") == "true",
        }

    # <Values> children: <Value>, <ValueGroup>, <MultiValue>
    values_root = product.find("{*}Values")
    if values_root is not None:
        yield from _walk_values(values_root, pid)

    # Product cross-references
    for ref in product.findall("{*}ProductCrossReference"):
        yield {
            "change_element_type": "REFERENCE_ADDED",
            "step_product_id": pid,
            "ref_type": ref.get("Type"),
            "target_id": ref.get("ProductID"),
            "qualifier_id": ref.get("QualifierID"),
            "changed_hint": ref.get("Changed") == "true",
        }
    for ref in product.findall("{*}DeleteProductCrossReference"):
        yield {
            "change_element_type": "REFERENCE_REMOVED",
            "step_product_id": pid,
            "ref_type": ref.get("Type"),
            "target_id": ref.get("ProductID"),
            "qualifier_id": ref.get("QualifierID"),
        }
    for ref in product.findall("{*}SuppressedProductCrossReference"):
        yield {
            "change_element_type": "REFERENCE_SUPPRESSED",
            "step_product_id": pid,
            "ref_type": ref.get("Type"),
            "target_id": ref.get("ProductID"),
            "qualifier_id": ref.get("QualifierID"),
        }

    # Asset cross-references
    for a in product.findall("{*}AssetCrossReference"):
        yield {
            "change_element_type": "ASSET_LINKED",
            "step_product_id": pid,
            "ref_type": a.get("Type"),
            "target_id": a.get("AssetID"),
            "qualifier_id": a.get("QualifierID"),
            "changed_hint": a.get("Changed") == "true",
        }
    for a in product.findall("{*}DeleteAssetCrossReference"):
        yield {
            "change_element_type": "ASSET_UNLINKED",
            "step_product_id": pid,
            "ref_type": a.get("Type"),
            "target_id": a.get("AssetID"),
            "qualifier_id": a.get("QualifierID"),
        }
    for a in product.findall("{*}SuppressedAssetCrossReference"):
        yield {
            "change_element_type": "ASSET_SUPPRESSED",
            "step_product_id": pid,
            "ref_type": a.get("Type"),
            "target_id": a.get("AssetID"),
            "qualifier_id": a.get("QualifierID"),
        }

    # Classification references — schema uses three element names interchangeably
    # depending on export shape: ClassificationReference, ClassificationCrossReference,
    # and the legacy ClassificationLink. Treat all as the same logical link.
    for c in product.findall("{*}ClassificationReference"):
        yield {
            "change_element_type": "CLASSIFICATION_LINKED",
            "step_product_id": pid,
            "target_id": c.get("ClassificationID"),
            "changed_hint": c.get("Changed") == "true",
        }
    for c in product.findall("{*}ClassificationCrossReference"):
        yield {
            "change_element_type": "CLASSIFICATION_LINKED",
            "step_product_id": pid,
            "target_id": c.get("ClassificationID"),
            "ref_type": c.get("Type"),
            "changed_hint": c.get("Changed") == "true",
        }
    for c in product.findall("{*}DeleteClassificationReference"):
        yield {
            "change_element_type": "CLASSIFICATION_UNLINKED",
            "step_product_id": pid,
            "target_id": c.get("ClassificationID"),
        }
    for c in product.findall("{*}DeleteClassificationCrossReference"):
        yield {
            "change_element_type": "CLASSIFICATION_UNLINKED",
            "step_product_id": pid,
            "target_id": c.get("ClassificationID"),
            "ref_type": c.get("Type"),
        }

    # Data containers — use .// to catch both direct and MultiDataContainer-wrapped
    for dc in product.findall("{*}DataContainers//{*}DataContainer"):
        container_id = dc.get("ID")
        # Get the container type from the parent MultiDataContainer
        parent = dc.getparent()
        container_type = parent.get("Type") if parent is not None else None

        yield {
            "change_element_type": "CONTAINER_ADDED",
            "step_product_id": pid,
            "step_container_id": container_id,
            "target_id": container_type,
            "changed_hint": dc.get("Changed") == "true",
        }

        # Nested values inside the container — handle Value / ValueGroup / MultiValue
        cv_root = dc.find("{*}Values")
        if cv_root is not None:
            for ev in _walk_values(cv_root, pid):
                if ev["change_element_type"] == "ATTRIBUTE_VALUE":
                    ev["change_element_type"] = "CONTAINER_VALUE"
                ev["step_container_id"] = container_id
                yield ev

        # Nested asset links inside the container
        for a in dc.findall("{*}AssetCrossReference"):
            yield {
                "change_element_type": "ASSET_LINKED",
                "step_product_id": pid,
                "step_container_id": container_id,
                "ref_type": a.get("Type"),
                "target_id": a.get("AssetID"),
                "changed_hint": a.get("Changed") == "true",
            }

    for ddc in product.findall("{*}DataContainers//{*}DeleteDataContainer"):
        yield {
            "change_element_type": "CONTAINER_REMOVED",
            "step_product_id": pid,
            "step_container_id": ddc.get("ID"),
        }


def _effective_qualifier(el) -> Optional[str]:
    """
    A STEPXML <Value> can carry its locale/context in any of three attributes:
        QualifierID         — explicit qualifier (e.g. "da", "en-US", "Qualifier root")
        LOVQualifierID      — locale of an LOV (List-Of-Values) display label
        DerivedContextID    — context of a derived/computed value
    Treat them uniformly so each becomes its own (attribute, qualifier) row.
    """
    return (el.get("QualifierID")
            or el.get("LOVQualifierID")
            or el.get("DerivedContextID"))


def _value_event(val_el, product_id: str, event_type: str,
                 attribute_id: Optional[str] = None,
                 group_lov_id: Optional[str] = None) -> Dict[str, Any]:
    """Build a change event dict from a <Value> element.

    `attribute_id` / `group_lov_id` allow callers to pass values inherited
    from a wrapping <ValueGroup> (the inner <Value> doesn't repeat them)."""
    return {
        "change_element_type": event_type,
        "step_product_id": product_id,
        "attribute_id": val_el.get("AttributeID") or attribute_id,
        "qualifier_id": _effective_qualifier(val_el),
        "unit_id": val_el.get("UnitID"),
        "lov_id": val_el.get("ID") or group_lov_id,
        "current_value": (val_el.text or "").strip(),
        "changed_hint": val_el.get("Changed") == "true",
        "inherited": val_el.get("Inherited"),
        "derived": val_el.get("Derived") == "true",
    }


def _collect_multi_members(mv) -> list[Dict[str, Any]]:
    """Flatten a <MultiValue> into a list of per-value dicts.

    A MultiValue can hold:
      - direct <Value> children
      - one or more <ValueGroup> wrappers, each containing <Value> children
        (the schema uses ValueGroup to bind a QualifierID to a set of LOV labels)

    Each returned dict carries qualifier, lov_id, unit_id, and text so the
    UI can render qualifier-aware multi-value displays without losing data.
    """
    members: list[Dict[str, Any]] = []
    for child in mv:
        local = etree.QName(child.tag).localname
        if local == "Value":
            members.append({
                "qualifier_id": _effective_qualifier(child),
                "lov_id": child.get("ID"),
                "unit_id": child.get("UnitID"),
                "value": (child.text or "").strip(),
            })
        elif local == "ValueGroup":
            group_qid = _effective_qualifier(child)
            group_lov = child.get("ID")
            for v in child.findall("{*}Value"):
                members.append({
                    "qualifier_id": _effective_qualifier(v) or group_qid,
                    "lov_id": v.get("ID") or group_lov,
                    "unit_id": v.get("UnitID"),
                    "value": (v.text or "").strip(),
                })
    return members


def _walk_values(values_root, product_id: str) -> Iterator[Dict[str, Any]]:
    """
    Walk a <Values> element and yield one event per atomic value.

    Handles the three child forms STEP exports use:
      <Value AttributeID="X">…</Value>                              — single value
      <ValueGroup AttributeID="X"> <Value …>…</Value>* </ValueGroup> — per-locale set
      <MultiValue AttributeID="X"> … </MultiValue>                  — multi-valued attr

    The previous implementation only matched direct <Value> children of <Values>,
    silently dropping every value nested inside a <ValueGroup> or <MultiValue>.
    """
    for child in values_root:
        local = etree.QName(child.tag).localname
        if local == "Value":
            yield _value_event(child, product_id, "ATTRIBUTE_VALUE")
        elif local == "ValueGroup":
            attr_id = child.get("AttributeID")
            group_lov = child.get("ID")  # e.g. ValueGroup ID="3-4 years" for LOV-typed attr
            group_changed = child.get("Changed") == "true"
            inner = child.findall("{*}Value")
            if not inner:
                # An empty <ValueGroup AttributeID="X"/> is a placeholder — emit a
                # single empty event so the diff engine can detect a clear/null.
                yield {
                    "change_element_type": "ATTRIBUTE_VALUE",
                    "step_product_id": product_id,
                    "attribute_id": attr_id,
                    "qualifier_id": None,
                    "unit_id": None,
                    "lov_id": group_lov,
                    "current_value": "",
                    "changed_hint": group_changed,
                    "inherited": None,
                    "derived": False,
                }
                continue
            for v in inner:
                ev = _value_event(v, product_id, "ATTRIBUTE_VALUE",
                                  attribute_id=attr_id, group_lov_id=group_lov)
                if group_changed and not ev["changed_hint"]:
                    ev["changed_hint"] = True
                yield ev
        elif local == "MultiValue":
            members = _collect_multi_members(child)
            yield {
                "change_element_type": "MULTIVALUE_CHANGED",
                "step_product_id": product_id,
                "attribute_id": child.get("AttributeID"),
                # MultiValue itself has no qualifier; per-value qualifiers
                # are preserved in current_members.
                "qualifier_id": None,
                "current_values": [m["value"] for m in members],
                "current_members": members,
                "changed_hint": child.get("Changed") == "true",
            }


# ── Convenience helpers ─────────────────────────────────────────────
# Attribute IDs by convention for modification metadata (configurable in OIE
# export mapping). If present, the diff engine uses them to populate
# change_records.changed_by and change_records.change_date.
LAST_MOD_DATE_ATTR = "STEP_LastModifiedDate"
LAST_MOD_USER_ATTR = "STEP_LastModifiedByUserID"


def extract_modification_metadata(events: list[Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    """
    Scan a list of parsed events and extract modification metadata
    (per-product changed_by and change_date) from the well-known attribute IDs.

    Returns: { product_id: { 'changed_by': ..., 'change_date': ... } }
    """
    meta: Dict[str, Dict[str, str]] = {}
    for ev in events:
        if ev["change_element_type"] != "ATTRIBUTE_VALUE":
            continue
        pid = ev["step_product_id"]
        attr = ev.get("attribute_id")
        val = ev.get("current_value")
        if not val:
            continue
        if attr == LAST_MOD_DATE_ATTR:
            meta.setdefault(pid, {})["change_date"] = val
        elif attr == LAST_MOD_USER_ATTR:
            meta.setdefault(pid, {})["changed_by"] = val
    return meta
