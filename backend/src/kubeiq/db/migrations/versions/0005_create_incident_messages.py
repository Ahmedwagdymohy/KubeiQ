"""follow-up chat on the incidents of an investigation

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-26 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "incident_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("investigation_id", sa.String(length=36), nullable=False),
        sa.Column("incident_id", sa.String(length=512), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("author", sa.String(length=254), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_incident_messages_thread", "incident_messages", ["investigation_id", "incident_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_incident_messages_thread", table_name="incident_messages")
    op.drop_table("incident_messages")
