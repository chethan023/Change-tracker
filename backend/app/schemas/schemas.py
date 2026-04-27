"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, ConfigDict, Field


class Role(str, Enum):
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


# ── Auth ────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    role: str
    must_change_password: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=128)


# ── Users ───────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    role: Role = Role.viewer
    step_user_id: Optional[str] = None


class UserUpdate(BaseModel):
    role: Optional[Role] = None
    active: Optional[bool] = None
    step_user_id: Optional[str] = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=12, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=12, max_length=128)


class ForgotPasswordResponse(BaseModel):
    """Always 200; the optional `reset_url` is only populated when the server has
    no SMTP configured (dev/local mode), so admins can hand the link out manually."""
    message: str = "If that email is registered, a reset link has been sent."
    reset_url: Optional[str] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    role: str
    step_user_id: Optional[str] = None
    active: bool
    must_change_password: bool = False
    last_login: Optional[datetime] = None
    created_at: datetime


# ── Config ──────────────────────────────────────────────────────────
class ConfigResponse(BaseModel):
    client_name: str
    logo_url: Optional[str] = None
    primary_colour: str
    step_base_url: Optional[str] = None
    # Retained days stored in DB; None means "not configured, use run-endpoint defaults".
    change_records_retention_days: Optional[int] = None
    raw_xml_retention_days: Optional[int] = None
    updated_at: Optional[datetime] = None


class ConfigUpdate(BaseModel):
    # Empty strings are allowed and mean "clear the override and fall back to
    # the env default" — the GET resolver treats blank values as missing.
    client_name: Optional[str] = Field(None, max_length=255)
    logo_url: Optional[str] = Field(None, max_length=512)
    # Brand colour is the one strictly-validated field: a malformed value
    # would leak into CSS.
    primary_colour: Optional[str] = Field(
        None, pattern=r"^(?:#(?:[0-9a-fA-F]{3}){1,2})?$",
    )
    step_base_url: Optional[str] = Field(None, max_length=512)
    # Explicit null clears the stored preference; omitting the field leaves it unchanged.
    change_records_retention_days: Optional[int] = Field(None, ge=7, le=3650)
    raw_xml_retention_days: Optional[int] = Field(None, ge=7, le=3650)


class SecurityPolicies(BaseModel):
    """Read-only snapshot of server-enforced security/runtime policies."""
    jwt_expire_minutes: int
    login_rate_limit_per_min: int
    password_min_length: int
    max_users: int
    user_count: int
    smtp_configured: bool
    env: str


class RetentionRunRequest(BaseModel):
    """Manual retention-cleanup request body. Days are validated client-side
    too but kept here for direct API use."""
    change_records_days: Optional[int] = Field(None, ge=7, le=3650)
    raw_xml_days: Optional[int] = Field(None, ge=7, le=3650)


class RetentionRunResult(BaseModel):
    change_records_deleted: int
    raw_xml_cleared: int
    cutoff_change_records: Optional[datetime] = None
    cutoff_raw_xml: Optional[datetime] = None


class IngestCredentials(BaseModel):
    """Ingestion credentials surfaced to admins inside Settings → STEP. The
    plaintext key is included so it can be copied — the endpoint is
    admin-only and must not be cached or logged downstream."""
    api_key: str
    masked: str
    header_name: str = "X-API-Key"
    endpoint: str = "/api/v1/ingest"
    # Where the active key came from: "db" (rotated in-app) or "env" (deployment-managed).
    source: str = "env"


# ── Ingest ──────────────────────────────────────────────────────────
class IngestResponse(BaseModel):
    message: str
    snapshot_id: int
    file_hash: str


# ── Changes ─────────────────────────────────────────────────────────
class ChangeRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    change_element_type: str
    step_product_id: str
    attribute_id: Optional[str] = None
    ref_type: Optional[str] = None
    target_id: Optional[str] = None
    qualifier_id: Optional[str] = None
    unit_id: Optional[str] = None
    lov_id: Optional[str] = None
    current_value: Optional[str] = None
    previous_value: Optional[str] = None
    current_values: Optional[List[Any]] = None
    previous_values: Optional[List[Any]] = None
    step_container_id: Optional[str] = None
    changed_by: Optional[str] = None
    change_date: datetime
    snapshot_id: Optional[int] = None
    snapshot_week: Optional[str] = None
    changed_hint: bool = False


class ChangeListResponse(BaseModel):
    # `total` is only computed on page 1 — on a multi-million-row table the
    # COUNT(*) dominates latency. Subsequent pages return None and the client
    # uses `has_more` to drive pagination instead.
    total: Optional[int] = None
    page: int
    page_size: int
    has_more: bool = False
    items: List[ChangeRecordOut]


class FilterOptions(BaseModel):
    change_element_types: List[str]
    attribute_ids: List[str]
    qualifier_ids: List[str]
    snapshot_weeks: List[str]
    changed_by: List[str]
    product_ids: List[str]


# ── Snapshots ───────────────────────────────────────────────────────
class SnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    received_at: datetime
    file_hash: Optional[str] = None
    status: str
    records_parsed: int = 0
    records_changed: int = 0
    snapshot_week: Optional[str] = None
    error_log: Optional[str] = None


# ── Notifications ───────────────────────────────────────────────────
class NotificationRuleCreate(BaseModel):
    rule_name: str
    # Legacy scalar fields (accepted, folded into the list variants server-side)
    change_element_type: Optional[str] = None
    attribute_id: Optional[str] = None
    qualifier_id: Optional[str] = None
    # Multi-value filters
    change_element_types: Optional[List[str]] = None
    attribute_ids: Optional[List[str]] = None
    qualifier_ids: Optional[List[str]] = None
    ref_types: Optional[List[str]] = None
    target_ids: Optional[List[str]] = None
    notify_channel: str = "email"
    notify_target: str


class NotificationRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rule_name: str
    change_element_type: Optional[str] = None
    attribute_id: Optional[str] = None
    qualifier_id: Optional[str] = None
    change_element_types: Optional[List[str]] = None
    attribute_ids: Optional[List[str]] = None
    qualifier_ids: Optional[List[str]] = None
    ref_types: Optional[List[str]] = None
    target_ids: Optional[List[str]] = None
    notify_channel: str
    notify_target: str
    active: bool
    created_at: datetime


class NotificationFilterOptions(BaseModel):
    change_element_types: List[str]
    attribute_ids: List[str]
    qualifier_ids: List[str]
    ref_types: List[str]
    target_ids: List[str]


# ── Products ────────────────────────────────────────────────────────
class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    step_product_id: str
    parent_id: Optional[str] = None
    user_type_id: Optional[str] = None
    change_count: Optional[int] = None
    last_change_date: Optional[datetime] = None


class ProductAttributeRow(BaseModel):
    attribute_id: str
    qualifier_id: Optional[str] = None
    unit_id: Optional[str] = None
    lov_id: Optional[str] = None
    value_text: Optional[str] = None
    values_json: Optional[List[Any]] = None
    kind: str  # "single" | "multi"
    change_count: int = 0
    last_change_date: Optional[datetime] = None


class ProductReferenceRow(BaseModel):
    ref_type: str
    target_product_id: str
    qualifier_id: Optional[str] = None
    suppressed: bool = False


class ProductDetail(BaseModel):
    step_product_id: str
    parent_id: Optional[str] = None
    user_type_id: Optional[str] = None
    names: List[dict] = []
    attributes: List[ProductAttributeRow] = []
    references: List[ProductReferenceRow] = []
    classifications: List[str] = []
    change_count: int = 0
    last_change_date: Optional[datetime] = None
