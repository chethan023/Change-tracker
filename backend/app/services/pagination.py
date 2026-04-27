"""Cursor pagination helpers.

Cursors are opaque base64(JSON) tokens that encode the sort key of the *last*
row in the previous page. The next page's WHERE clause uses strict
inequalities on that key so we never re-scan rows or skip rows when new
inserts arrive between requests — the failure mode of OFFSET pagination.

Tokens are not signed. They expose ordering data (timestamp + id, or a
product id) which is already visible in list responses, so signing would
add cost without raising the security bar.
"""
from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any, Optional


def encode_cursor(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), default=_default).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(token: Optional[str]) -> Optional[dict[str, Any]]:
    if not token:
        return None
    try:
        padded = token + "=" * (-len(token) % 4)
        return json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except (ValueError, json.JSONDecodeError):
        # A malformed cursor should behave like "no cursor" — first page —
        # rather than a 500. The caller still validates required fields.
        return None


def _default(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Not serializable: {type(obj).__name__}")
