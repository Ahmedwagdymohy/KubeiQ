"""per-cluster settings: name, labels, default namespace, usage thresholds

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-30 11:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cluster_settings",
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("cluster_id", sa.String(length=512), nullable=False),
        sa.Column("display_name", sa.String(length=64), nullable=True),
        sa.Column("labels", sa.JSON(), nullable=False),
        sa.Column("namespace", sa.String(length=253), nullable=True),
        sa.Column("metrics", sa.Boolean(), nullable=False),
        sa.Column("cpu_warning", sa.Integer(), nullable=False),
        sa.Column("cpu_critical", sa.Integer(), nullable=False),
        sa.Column("memory_warning", sa.Integer(), nullable=False),
        sa.Column("memory_critical", sa.Integer(), nullable=False),
        sa.Column("alerts", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("org_id", "cluster_id"),
    )


def downgrade() -> None:
    op.drop_table("cluster_settings")
