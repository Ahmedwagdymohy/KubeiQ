"""usage history: one sample per cluster per minute, downsampled after a day

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-30 13:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "usage_samples",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("cluster_id", sa.String(length=512), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("seconds", sa.Integer(), nullable=False),
        sa.Column("cpu_used", sa.Float(), nullable=True),
        sa.Column("cpu_capacity", sa.Float(), nullable=True),
        sa.Column("memory_used", sa.Float(), nullable=True),
        sa.Column("memory_capacity", sa.Float(), nullable=True),
        sa.Column("pods_running", sa.Integer(), nullable=True),
        sa.Column("pods", sa.Integer(), nullable=True),
        sa.Column("nodes_ready", sa.Integer(), nullable=True),
        sa.Column("nodes", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_usage_cluster_at", "usage_samples", ["cluster_id", "at"])


def downgrade() -> None:
    op.drop_index("ix_usage_cluster_at", table_name="usage_samples")
    op.drop_table("usage_samples")
