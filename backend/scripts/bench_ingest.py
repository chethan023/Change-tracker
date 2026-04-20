"""
Benchmark: generates a synthetic STEPXML payload with N products and
measures end-to-end ingest (stream parse + per-product diff + commit).

Usage (from backend/ with venv activated):
    python -m scripts.bench_ingest --products 1000

Prints: file size, peak RSS, parse-only time, full-diff time, query count.
"""
from __future__ import annotations

import argparse
import sys
import tempfile
import time
from pathlib import Path

from sqlalchemy import event

# Bootstrap: make sure backend/ is on sys.path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db.session import SessionLocal, engine  # noqa: E402
from app.models import Snapshot  # noqa: E402
from app.services.diff_engine import process_snapshot_path  # noqa: E402
from app.services.stepxml_parser import parse_stepxml_stream  # noqa: E402


PRODUCT_TEMPLATE = """  <Product ID="{pid}" ParentID="ROOT" UserTypeID="StandardProduct">
    <Name QualifierID="en">Synthetic Product {pid}</Name>
    <Values>
      <Value AttributeID="ATTR_COLOR">red</Value>
      <Value AttributeID="ATTR_SIZE" UnitID="cm">42</Value>
      <Value AttributeID="ATTR_WEIGHT" UnitID="kg">1.5</Value>
      <Value AttributeID="ATTR_BRAND">Acme</Value>
      <Value AttributeID="ATTR_MATERIAL">cotton</Value>
      <MultiValue AttributeID="ATTR_TAGS">
        <Value>tag-a</Value><Value>tag-b</Value><Value>tag-c</Value>
      </MultiValue>
    </Values>
    <ProductCrossReference Type="RELATED" ProductID="REL-{pid}"/>
    <ClassificationReference ClassificationID="CAT-1"/>
  </Product>
"""


def write_synthetic(path: Path, n_products: int) -> int:
    with path.open("wb") as fh:
        fh.write(b'<?xml version="1.0" encoding="UTF-8"?>\n')
        fh.write(b'<STEP-ProductInformation xmlns="http://www.stibosystems.com/step" ContextID="Context1">\n')
        fh.write(b'  <Products>\n')
        for i in range(n_products):
            fh.write(PRODUCT_TEMPLATE.format(pid=f"BENCH-{i:06d}").encode("utf-8"))
        fh.write(b'  </Products>\n')
        fh.write(b'</STEP-ProductInformation>\n')
    return path.stat().st_size


def parse_only(path: Path) -> tuple[int, float]:
    t0 = time.perf_counter()
    n = 0
    with path.open("rb") as fh:
        for _ev in parse_stepxml_stream(fh):
            n += 1
    return n, time.perf_counter() - t0


def full_ingest(path: Path) -> tuple[float, int]:
    db = SessionLocal()
    query_count = {"n": 0}

    @event.listens_for(engine, "before_cursor_execute")
    def _count(conn, cursor, statement, params, context, executemany):  # noqa: ANN001
        query_count["n"] += 1

    try:
        snap = Snapshot(file_hash=f"bench-{int(time.time())}", status="queued")
        db.add(snap); db.commit(); db.refresh(snap)
        t0 = time.perf_counter()
        process_snapshot_path(db, snap, str(path))
        elapsed = time.perf_counter() - t0
        return elapsed, query_count["n"]
    finally:
        event.remove(engine, "before_cursor_execute", _count)
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--products", type=int, default=1000)
    args = ap.parse_args()

    tmp = Path(tempfile.gettempdir()) / f"bench-{args.products}.xml"
    print(f"writing synthetic XML to {tmp} …")
    size = write_synthetic(tmp, args.products)
    print(f"  size: {size / 1024 / 1024:.2f} MB ({size:,} bytes)")

    print("parse-only pass …")
    n, t = parse_only(tmp)
    print(f"  events: {n:,}    time: {t:.2f}s    rate: {n / t:,.0f} ev/s")

    print("full ingest (preload + diff + commit per product) …")
    t, q = full_ingest(tmp)
    print(f"  time: {t:.2f}s    sql queries: {q:,}    queries/product: {q / args.products:.1f}")


if __name__ == "__main__":
    main()
