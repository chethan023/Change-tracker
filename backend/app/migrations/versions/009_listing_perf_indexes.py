"""Add listing-page perf indexes for keyset pagination + search.

Revision ID: 009_listing_perf_indexes
Revises: 008_client_config_ingest_key
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa


revision = "009_listing_perf_indexes"
down_revision = "008_client_config_ingest_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Snapshots: keyset on (received_at DESC, id DESC) for /snapshots list.
    if dialect == "sqlite":
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_snapshots_received_id "
            "ON snapshots (received_at, id)"
        )
    else:
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_snapshots_received_id "
            "ON snapshots (received_at DESC, id DESC)"
        )

    # Postgres: trigram GIN for product list search and snapshot hash search.
    # SQLite cannot do this; ILIKE there falls back to a sequential scan,
    # which is fine for dev volumes.
    if dialect == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_products_search_trgm ON products "
            "USING gin (step_product_id gin_trgm_ops, "
            "parent_id gin_trgm_ops, user_type_id gin_trgm_ops)"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_snapshots_hash_trgm ON snapshots "
            "USING gin (file_hash gin_trgm_ops)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_snapshots_hash_trgm")
        op.execute("DROP INDEX IF EXISTS ix_products_search_trgm")

    op.execute("DROP INDEX IF EXISTS ix_snapshots_received_id")
