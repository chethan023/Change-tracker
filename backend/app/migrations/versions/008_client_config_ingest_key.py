"""Add ingest_api_key column to client_config

Revision ID: 008_client_config_ingest_key
Revises: 007_client_config_retention
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = "008_client_config_ingest_key"
down_revision = "007_client_config_retention"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_config",
        sa.Column("ingest_api_key", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_config", "ingest_api_key")
