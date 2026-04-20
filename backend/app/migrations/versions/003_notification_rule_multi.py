"""Add multi-value filter columns to notification_rules

Revision ID: 003_notification_rule_multi
Revises: 002_user_must_change_password
Create Date: 2026-04-20
"""
from alembic import op
import sqlalchemy as sa


revision = "003_notification_rule_multi"
down_revision = "002_user_must_change_password"
branch_labels = None
depends_on = None


NEW_COLS = [
    "change_element_types",
    "attribute_ids",
    "qualifier_ids",
    "ref_types",
    "target_ids",
]


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing = {c["name"] for c in insp.get_columns("notification_rules")}
    with op.batch_alter_table("notification_rules") as batch:
        for name in NEW_COLS:
            if name not in existing:
                batch.add_column(sa.Column(name, sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("notification_rules") as batch:
        for name in NEW_COLS:
            batch.drop_column(name)
