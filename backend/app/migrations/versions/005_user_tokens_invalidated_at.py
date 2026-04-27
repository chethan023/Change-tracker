"""Add users.tokens_invalidated_at

Revision ID: 005_user_tokens_invalidated_at
Revises: 004_change_records_perf_indexes
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa


revision = "005_user_tokens_invalidated_at"
down_revision = "004_change_records_perf_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("users")}
    if "tokens_invalidated_at" not in cols:
        with op.batch_alter_table("users") as batch:
            batch.add_column(sa.Column(
                "tokens_invalidated_at", sa.Integer(),
                nullable=False, server_default="0",
            ))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("tokens_invalidated_at")
