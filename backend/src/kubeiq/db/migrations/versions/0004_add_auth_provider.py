"""users sign in with a password or with Google; usernames may be email addresses

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-25 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.alter_column(
            "username", existing_type=sa.String(length=64), type_=sa.String(length=254)
        )
        batch.add_column(
            sa.Column(
                "auth_provider", sa.String(length=16), nullable=False, server_default="password"
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("auth_provider")
        batch.alter_column(
            "username", existing_type=sa.String(length=254), type_=sa.String(length=64)
        )
