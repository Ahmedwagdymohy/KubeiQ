"""clusters connected through the KubeiQ Agent

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-30 18:00:00
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
        "agent_clusters",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=True),
        sa.Column("created_by", sa.String(length=254), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=True),
        sa.Column("code_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=True),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("agent_version", sa.String(length=64), nullable=True),
        sa.Column("kubernetes_version", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash"),
        sa.UniqueConstraint("token_hash"),
        sa.UniqueConstraint("org_id", "name", name="uq_agent_clusters_org_name"),
    )
    op.create_index("ix_agent_clusters_org_id", "agent_clusters", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_clusters_org_id", table_name="agent_clusters")
    op.drop_table("agent_clusters")
