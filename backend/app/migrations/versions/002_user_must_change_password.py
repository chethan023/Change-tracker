"""Add users.must_change_password

Revision ID: 002_user_must_change_password
Revises: 001_initial
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa


revision = "002_user_must_change_password"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("users")}
    if "must_change_password" not in cols:
        with op.batch_alter_table("users") as batch:
            batch.add_column(sa.Column(
                "must_change_password", sa.Boolean(),
                nullable=False, server_default=sa.false(),
            ))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("must_change_password")
