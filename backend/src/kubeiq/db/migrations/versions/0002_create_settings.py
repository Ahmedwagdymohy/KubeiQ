"""create settings and kubeconfigs

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-23 10:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("org_id", "key"),
    )
    op.create_table(
        "kubeconfigs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "name", name="uq_kubeconfigs_org_name"),
    )
    with op.batch_alter_table("kubeconfigs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_kubeconfigs_org_id"), ["org_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("kubeconfigs", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_kubeconfigs_org_id"))
    op.drop_table("kubeconfigs")
    op.drop_table("app_settings")
