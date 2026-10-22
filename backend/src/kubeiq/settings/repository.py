"""Database access for settings and stored kubeconfigs."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.db.models import DEFAULT_ORG, AppSetting, StoredKubeconfig

__all__ = ["StoredKubeconfig"]

AI_KEY = "ai"


async def get_value(
    session: AsyncSession, key: str, org_id: str = DEFAULT_ORG
) -> dict[str, Any] | None:
    row = await session.get(AppSetting, (org_id, key))
    return dict(row.value) if row else None


async def put_value(
    session: AsyncSession, key: str, value: dict[str, Any], org_id: str = DEFAULT_ORG
) -> None:
    row = await session.get(AppSetting, (org_id, key))
    if row:
        row.value = value
    else:
        session.add(AppSetting(org_id=org_id, key=key, value=value))
    await session.commit()


async def list_kubeconfigs(
    session: AsyncSession, org_id: str = DEFAULT_ORG
) -> list[StoredKubeconfig]:
    query = (
        select(StoredKubeconfig)
        .where(StoredKubeconfig.org_id == org_id)
        .order_by(StoredKubeconfig.created_at)
    )
    return list((await session.execute(query)).scalars())


async def add_kubeconfig(
    session: AsyncSession, name: str, encrypted: str, org_id: str = DEFAULT_ORG
) -> StoredKubeconfig:
    row = StoredKubeconfig(org_id=org_id, name=name, content=encrypted)
    session.add(row)
    await session.commit()
    return row


async def delete_kubeconfig(
    session: AsyncSession, kubeconfig_id: str, org_id: str = DEFAULT_ORG
) -> bool:
    row = await session.get(StoredKubeconfig, kubeconfig_id)
    if not row or row.org_id != org_id:
        return False
    await session.delete(row)
    await session.commit()
    return True
