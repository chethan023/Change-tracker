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

    # Direct <Values>/<Value>
    for val in product.findall("{*}Values/{*}Value"):
        yield _value_event(val, pid, "ATTRIBUTE_VALUE")

    # <Values>/<MultiValue>
    for mv in product.findall("{*}Values/{*}MultiValue"):
        values = [
            (v.text or "").strip()
            for v in mv.findall("{*}Value")
            if v.text is not None
        ]
        yield {
            "change_element_type": "MULTIVALUE_CHANGED",
            "step_product_id": pid,
            "attribute_id": mv.get("AttributeID"),
            "qualifier_id": None,   # MultiValue in this schema has no QualifierID at the wrapper
            "current_values": values,
            "changed_hint": mv.get("Changed") == "true",
        }

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

    # Classification references
    for c in product.findall("{*}ClassificationReference"):
        yield {
            "change_element_type": "CLASSIFICATION_LINKED",
            "step_product_id": pid,
            "target_id": c.get("ClassificationID"),
            "changed_hint": c.get("Changed") == "true",
        }
    for c in product.findall("{*}DeleteClassificationReference"):
        yield {
            "change_element_type": "CLASSIFICATION_UNLINKED",
            "step_product_id": pid,
            "target_id": c.get("ClassificationID"),
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

        # Nested values inside the container
        for val in dc.findall("{*}Values/{*}Value"):
            ev = _value_event(val, pid, "CONTAINER_VALUE")
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


def _value_event(val_el, product_id: str, event_type: str) -> Dict[str, Any]:
    """Build a change event dict from a <Value> element."""
    return {
        "change_element_type": event_type,
        "step_product_id": product_id,
        "attribute_id": val_el.get("AttributeID"),
        "qualifier_id": val_el.get("QualifierID"),
        "unit_id": val_el.get("UnitID"),
        "lov_id": val_el.get("ID"),
        "current_value": (val_el.text or "").strip(),
        "changed_hint": val_el.get("Changed") == "true",
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
