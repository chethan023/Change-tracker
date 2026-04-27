"""Add retention day columns to client_config

Revision ID: 007_client_config_retention
Revises: 006_password_reset_tokens
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = "007_client_config_retention"
down_revision = "006_password_reset_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_config",
        sa.Column("change_records_retention_days", sa.Integer(), nullable=True),
    )
    op.add_column(
        "client_config",
        sa.Column("raw_xml_retention_days", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_config", "raw_xml_retention_days")
    op.drop_column("client_config", "change_records_retention_days")
