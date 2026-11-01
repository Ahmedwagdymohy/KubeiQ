"""cluster security: scans and their findings, vulnerabilities and controls

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-30 21:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "security_scans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("cluster_id", sa.String(length=512), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("step", sa.String(length=200), nullable=True),
        sa.Column("started_by", sa.String(length=254), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("ai_summary", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_scans_cluster", "security_scans", ["cluster_id", "started_at"])
    op.create_table(
        "security_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("scan_id", sa.String(length=36), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("namespace", sa.String(length=253), nullable=True),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["scan_id"], ["security_scans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_items_scan", "security_items", ["scan_id", "type", "position"])


def downgrade() -> None:
    op.drop_index("ix_security_items_scan", table_name="security_items")
    op.drop_table("security_items")
    op.drop_index("ix_security_scans_cluster", table_name="security_scans")
    op.drop_table("security_scans")
