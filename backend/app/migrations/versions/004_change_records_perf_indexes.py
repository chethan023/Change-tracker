"""Add composite + trigram indexes on change_records for hot list queries.

Revision ID: 004_change_records_perf_indexes
Revises: 003_notification_rule_multi
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa


revision = "004_change_records_perf_indexes"
down_revision = "003_notification_rule_multi"
branch_labels = None
depends_on = None


COMPOSITE_INDEXES = [
    ("ix_cr_date_id",      "(change_date DESC, id DESC)"),
    ("ix_cr_product_date", "(step_product_id, change_date DESC)"),
    ("ix_cr_type_date",    "(change_element_type, change_date DESC)"),
    ("ix_cr_week_date",    "(snapshot_week, change_date DESC)"),
    ("ix_cr_attr_date",    "(attribute_id, change_date DESC)"),
    ("ix_cr_user_date",    "(changed_by, change_date DESC)"),
]


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Drop the old single composite if present (replaced by ix_cr_product_date)
    insp = sa.inspect(bind)
    existing = {ix["name"] for ix in insp.get_indexes("change_records")}
    if "ix_change_records_product_date" in existing:
        op.drop_index("ix_change_records_product_date", table_name="change_records")

    for name, cols in COMPOSITE_INDEXES:
        if name in existing:
            continue
        if dialect == "sqlite":
            # SQLite ignores DESC in index defs in older versions; strip for portability.
            cols_sqlite = cols.replace(" DESC", "")
            op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON change_records {cols_sqlite}")
        else:
            op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON change_records {cols}")

    # Trigram GIN for ILIKE '%needle%' search across 4 columns. Postgres only.
    if dialect == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_cr_search_trgm ON change_records "
            "USING gin (step_product_id gin_trgm_ops, attribute_id gin_trgm_ops, "
            "current_value gin_trgm_ops, previous_value gin_trgm_ops)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_cr_search_trgm")

    for name, _ in COMPOSITE_INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")

    # Recreate the original index for full reversibility.
    op.create_index(
        "ix_change_records_product_date",
        "change_records",
        ["step_product_id", "change_date"],
    )
