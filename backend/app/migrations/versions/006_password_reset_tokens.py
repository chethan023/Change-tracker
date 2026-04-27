"""Add password_reset_tokens table

Revision ID: 006_password_reset_tokens
Revises: 005_user_tokens_invalidated_at
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa


revision = "006_password_reset_tokens"
down_revision = "005_user_tokens_invalidated_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "password_reset_tokens" in insp.get_table_names():
        return
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"),
                  nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("password_reset_tokens")
