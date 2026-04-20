"""Initial schema

Revision ID: 001_initial
Revises:
Create Date: 2024-04-01

Creates all 15 tables directly from SQLAlchemy metadata.
For a first migration, this is cleaner than hand-writing CREATE TABLE for each.
"""
from alembic import op
import sqlalchemy as sa

from app.db.session import Base
from app.models import base_models  # noqa: F401  — ensure models are registered


revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
