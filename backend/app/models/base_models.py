"""
All ORM models for the Change Tracker.

Schema follows v4 prompt doc Section 3.2 — fifteen tables covering
current state snapshots (for diff lookup) plus the change_records
audit log and the notification / user / config tables.
"""
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey,
    Enum as SAEnum, UniqueConstraint, Index, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy import JSON as JSONB

from app.db.session import Base


# ── Enum ────────────────────────────────────────────────────────────
class ChangeElementType(str, PyEnum):
    PRODUCT_CREATED          = "PRODUCT_CREATED"
    PRODUCT_DELETED          = "PRODUCT_DELETED"
    PRODUCT_RECLASSIFIED     = "PRODUCT_RECLASSIFIED"
    PRODUCT_TYPE_CHANGED     = "PRODUCT_TYPE_CHANGED"
    PRODUCT_NAME_CHANGED     = "PRODUCT_NAME_CHANGED"
    ATTRIBUTE_VALUE          = "ATTRIBUTE_VALUE"
    MULTIVALUE_CHANGED       = "MULTIVALUE_CHANGED"
    REFERENCE_ADDED          = "REFERENCE_ADDED"
    REFERENCE_REMOVED        = "REFERENCE_REMOVED"
    REFERENCE_SUPPRESSED     = "REFERENCE_SUPPRESSED"
    ASSET_LINKED             = "ASSET_LINKED"
    ASSET_UNLINKED           = "ASSET_UNLINKED"
    ASSET_SUPPRESSED         = "ASSET_SUPPRESSED"
    CLASSIFICATION_LINKED    = "CLASSIFICATION_LINKED"
    CLASSIFICATION_UNLINKED  = "CLASSIFICATION_UNLINKED"
    CONTAINER_ADDED          = "CONTAINER_ADDED"
    CONTAINER_REMOVED        = "CONTAINER_REMOVED"
    CONTAINER_VALUE          = "CONTAINER_VALUE"


# ── Current-state tables (used by diff engine) ──────────────────────
class Product(Base):
    __tablename__ = "products"
    id              = Column(Integer, primary_key=True)
    step_product_id = Column(String(255), unique=True, nullable=False, index=True)
    parent_id       = Column(String(255))
    user_type_id    = Column(String(255))
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProductName(Base):
    __tablename__ = "product_names"
    id             = Column(Integer, primary_key=True)
    step_product_id = Column(String(255), index=True, nullable=False)
    qualifier_id   = Column(String(128), index=True)
    name_text      = Column(Text)
    __table_args__ = (UniqueConstraint("step_product_id", "qualifier_id", name="uq_product_name"),)


class AttributeValue(Base):
    __tablename__ = "attribute_values"
    id              = Column(Integer, primary_key=True)
    step_product_id = Column(String(255), index=True, nullable=False)
    attribute_id    = Column(String(255), index=True, nullable=False)
    qualifier_id    = Column(String(128), index=True)
    unit_id         = Column(String(64))
    lov_id          = Column(String(128))
    value_text      = Column(Text)
    __table_args__ = (
        UniqueConstraint("step_product_id", "attribute_id", "qualifier_id", "unit_id",
                         name="uq_attr_value"),
    )


class MultiValue(Base):
    __tablename__ = "multi_values"
    id              = Column(Integer, primary_key=True)
    step_product_id = Column(String(255), index=True, nullable=False)
    attribute_id    = Column(String(255), index=True, nullable=False)
    qualifier_id    = Column(String(128), index=True)
    values_json     = Column(JSONB)
    __table_args__ = (
        UniqueConstraint("step_product_id", "attribute_id", "qualifier_id",
                         name="uq_multi_value"),
    )


class Reference(Base):
    __tablename__ = "references"
    id                = Column(Integer, primary_key=True)
    step_product_id   = Column(String(255), index=True, nullable=False)
    ref_type          = Column(String(255), nullable=False)
    target_product_id = Column(String(255), nullable=False)
    qualifier_id      = Column(String(128))
    suppressed        = Column(Boolean, default=False)
    __table_args__ = (
        UniqueConstraint("step_product_id", "ref_type", "target_product_id", "qualifier_id",
                         name="uq_reference"),
    )


class AssetLink(Base):
    __tablename__ = "asset_links"
    id              = Column(Integer, primary_key=True)
    step_product_id = Column(String(255), index=True, nullable=False)
    ref_type        = Column(String(255), nullable=False)
    asset_id        = Column(String(255), nullable=False)
    qualifier_id    = Column(String(128))
    suppressed      = Column(Boolean, default=False)
    __table_args__ = (
        UniqueConstraint("step_product_id", "ref_type", "asset_id", "qualifier_id",
                         name="uq_asset_link"),
    )


class Classification(Base):
    __tablename__ = "classifications"
    id                 = Column(Integer, primary_key=True)
    step_product_id    = Column(String(255), index=True, nullable=False)
    classification_id  = Column(String(255), nullable=False)
    suppressed         = Column(Boolean, default=False)
    __table_args__ = (
        UniqueConstraint("step_product_id", "classification_id", name="uq_classification"),
    )


class DataContainer(Base):
    __tablename__ = "data_containers"
    id                 = Column(Integer, primary_key=True)
    step_product_id    = Column(String(255), index=True, nullable=False)
    container_type     = Column(String(255))
    step_container_id  = Column(String(255), nullable=False)
    __table_args__ = (
        UniqueConstraint("step_product_id", "step_container_id", name="uq_data_container"),
    )


class ContainerValue(Base):
    __tablename__ = "container_values"
    id                = Column(Integer, primary_key=True)
    step_container_id = Column(String(255), index=True, nullable=False)
    attribute_id      = Column(String(255), nullable=False)
    qualifier_id      = Column(String(128))
    value_text        = Column(Text)
    __table_args__ = (
        UniqueConstraint("step_container_id", "attribute_id", "qualifier_id",
                         name="uq_container_value"),
    )


# ── Audit log ───────────────────────────────────────────────────────
class ChangeRecord(Base):
    __tablename__ = "change_records"
    id                    = Column(Integer, primary_key=True)
    change_element_type   = Column(SAEnum(ChangeElementType, name="change_element_type"),
                                   nullable=False, index=True)
    step_product_id       = Column(String(255), index=True, nullable=False)
    attribute_id          = Column(String(255), index=True)
    ref_type              = Column(String(255))
    target_id             = Column(String(255))
    qualifier_id          = Column(String(128), index=True)
    unit_id               = Column(String(64))
    lov_id                = Column(String(128))
    current_value         = Column(Text)
    previous_value        = Column(Text)
    current_values        = Column(JSONB)
    previous_values       = Column(JSONB)
    step_container_id     = Column(String(255))
    changed_by            = Column(String(255), index=True)
    change_date           = Column(DateTime, default=datetime.utcnow, index=True)
    snapshot_id           = Column(Integer, ForeignKey("snapshots.id"), index=True)
    snapshot_week         = Column(String(16), index=True)  # ISO week e.g. "2024-W14"
    changed_hint          = Column(Boolean, default=False)
    raw_xml_fragment      = Column(Text)

    snapshot = relationship("Snapshot", back_populates="change_records")

    __table_args__ = (
        Index("ix_change_records_product_date", "step_product_id", "change_date"),
    )


class Snapshot(Base):
    __tablename__ = "snapshots"
    id               = Column(Integer, primary_key=True)
    received_at      = Column(DateTime, default=datetime.utcnow, index=True)
    file_hash        = Column(String(64), unique=True, index=True)
    status           = Column(String(32), default="queued")   # queued / processing / completed / failed
    records_parsed   = Column(Integer, default=0)
    records_changed  = Column(Integer, default=0)
    error_log        = Column(Text)
    stepxml_raw      = Column(Text)
    snapshot_week    = Column(String(16), index=True)

    change_records = relationship("ChangeRecord", back_populates="snapshot")


# ── Notifications ───────────────────────────────────────────────────
class NotificationRule(Base):
    __tablename__ = "notification_rules"
    id                  = Column(Integer, primary_key=True)
    user_id             = Column(Integer, ForeignKey("users.id"), index=True)
    rule_name           = Column(String(255), nullable=False)
    # Legacy single-value columns — still populated for back-compat; match logic
    # prefers the JSON arrays below when they are non-empty.
    change_element_type = Column(SAEnum(ChangeElementType, name="change_element_type"), nullable=True)
    attribute_id        = Column(String(255))
    qualifier_id        = Column(String(128))
    # Multi-value filters (JSON arrays of strings). Empty/null array = "any".
    change_element_types = Column(JSONB)
    attribute_ids        = Column(JSONB)
    qualifier_ids        = Column(JSONB)
    ref_types            = Column(JSONB)
    target_ids           = Column(JSONB)
    notify_channel      = Column(String(32), default="email")  # email / slack
    notify_target       = Column(String(512))                   # email addr or slack webhook
    active              = Column(Boolean, default=True)
    created_at          = Column(DateTime, default=datetime.utcnow)


class NotificationLog(Base):
    __tablename__ = "notification_log"
    id                 = Column(Integer, primary_key=True)
    rule_id            = Column(Integer, ForeignKey("notification_rules.id"), index=True)
    change_record_id   = Column(Integer, ForeignKey("change_records.id"))
    dispatched_at      = Column(DateTime, default=datetime.utcnow)
    status             = Column(String(32))
    error              = Column(Text)


# ── Users & config ──────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id              = Column(Integer, primary_key=True)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    step_user_id    = Column(String(255))
    role            = Column(String(32), default="viewer")   # admin / steward / viewer
    hashed_password = Column(String(255), nullable=False)
    active          = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False, nullable=False)
    # Unix epoch (UTC seconds). JWTs whose `iat` is older than this are rejected,
    # giving us server-side revocation on password change / logout-all.
    tokens_invalidated_at = Column(Integer, default=0, nullable=False)
    last_login      = Column(DateTime)
    created_at      = Column(DateTime, default=datetime.utcnow)


class PasswordResetToken(Base):
    """Single-use, time-limited reset token. We store only a sha256 of the
    secret — the plaintext is mailed to the user and never persisted."""
    __tablename__ = "password_reset_tokens"
    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash  = Column(String(64), unique=True, index=True, nullable=False)
    expires_at  = Column(DateTime, nullable=False)
    used_at     = Column(DateTime)
    created_at  = Column(DateTime, default=datetime.utcnow)


class ClientConfig(Base):
    __tablename__ = "client_config"
    id                           = Column(Integer, primary_key=True)
    client_name                  = Column(String(255), default="Change Tracker")
    logo_url                     = Column(String(512))
    primary_colour               = Column(String(16), default="#1B3A6B")
    step_base_url                = Column(String(512))
    smtp_host                    = Column(String(255))
    slack_webhook_url            = Column(String(512))
    # Ingest API key managed in-app. NULL means "use INGEST_API_KEY env var".
    # Stored in plaintext because the receiving end (STEP) needs the same
    # value to send — it isn't a hashable secret.
    ingest_api_key               = Column(String(128), nullable=True)
    # Days to retain change records / raw STEPXML before cleanup.
    # NULL means no preference — the run endpoint uses its own defaults.
    change_records_retention_days = Column(Integer, nullable=True)
    raw_xml_retention_days        = Column(Integer, nullable=True)
    updated_at                   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
