"""The signed-in user's own preferences: pinned items, sidebar, last cluster, layouts."""

import json
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth.deps import CurrentUser
from kubeiq.db.models import DEFAULT_ORG, UserPreference
from kubeiq.db.session import get_session
from kubeiq.settings.models import WorkspaceSettings
from kubeiq.settings.repository import GENERAL_KEY, get_value

router = APIRouter(prefix="/me", tags=["me"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
Key = Annotated[str, Path(pattern=r"^[a-z][a-z0-9_.-]{0,63}$")]
MAX_BYTES = 16_000
MAX_KEYS = 50


@router.get("/workspace", response_model=WorkspaceSettings)
async def workspace(session: SessionDep) -> WorkspaceSettings:
    """The workspace's display settings, which every signed-in user's app follows."""
    return WorkspaceSettings(**(await get_value(session, GENERAL_KEY) or {}))


@router.get("/preferences")
async def get_preferences(user: CurrentUser, session: SessionDep) -> dict[str, Any]:
    rows = await session.execute(
        select(UserPreference).where(
            UserPreference.org_id == DEFAULT_ORG, UserPreference.user_id == user.user_id
        )
    )
    return {row.key: row.value for row in rows.scalars()}


@router.put("/preferences/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def put_preference(
    key: Key, user: CurrentUser, session: SessionDep, value: Annotated[Any, Body()] = None
) -> None:
    if len(json.dumps(value)) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Preference too large")
    row = await session.get(UserPreference, (DEFAULT_ORG, user.user_id, key))
    if row is None:
        count = await session.execute(
            select(UserPreference.key).where(UserPreference.user_id == user.user_id)
        )
        if len(count.all()) >= MAX_KEYS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Too many preferences")
        session.add(UserPreference(user_id=user.user_id, key=key, value=value))
    else:
        row.value = value
    await session.commit()


@router.delete("/preferences/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preference(key: Key, user: CurrentUser, session: SessionDep) -> None:
    row = await session.get(UserPreference, (DEFAULT_ORG, user.user_id, key))
    if row is not None:
        await session.delete(row)
        await session.commit()
