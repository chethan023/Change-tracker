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
    # `total` is only computed on page 1 to avoid an expensive COUNT on every
    # paginated request. Clients should rely on `has_more` for navigation when
    # `total` is None.
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
