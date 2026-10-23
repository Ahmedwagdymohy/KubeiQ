"""Settings API: AI model and kubeconfig files. Secrets are write-only."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq import __version__
from kubeiq.auth import repository as audit
from kubeiq.auth.deps import AdminUser, require_admin
from kubeiq.clusters.registry import get_local_source
from kubeiq.core.config import Settings, get_settings
from kubeiq.db.session import get_session
from kubeiq.settings import kubeconfigs, repository, service
from kubeiq.settings.crypto import decrypt, encrypt
from kubeiq.settings.models import (
    AboutOut,
    AISettingsIn,
    AISettingsOut,
    ChangesSettings,
    KubeconfigIn,
    KubeconfigOut,
    LocalKubeconfig,
    TestResult,
)
from kubeiq.settings.providers import PROVIDERS, Provider

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_admin)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("/providers", response_model=list[Provider])
async def providers() -> list[Provider]:
    return PROVIDERS


@router.get("/ai", response_model=AISettingsOut)
async def get_ai(session: SessionDep, base: SettingsDep) -> AISettingsOut:
    return service.to_view(await service.load_ai(session, base), base)


@router.put("/ai", response_model=AISettingsOut)
async def put_ai(
    body: AISettingsIn, session: SessionDep, base: SettingsDep, admin: AdminUser
) -> AISettingsOut:
    try:
        merged = service.merge_ai(await service.load_ai(session, base), body)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    await repository.put_value(session, repository.AI_KEY, merged)
    await audit.record(session, admin.username, "settings.ai", detail=merged.get("model") or None)
    return service.to_view(merged, base)


@router.post("/ai/test", response_model=TestResult)
async def test_ai(body: AISettingsIn, session: SessionDep, base: SettingsDep) -> TestResult:
    """Test the values in the form (not yet saved); a missing key falls back to the saved one."""
    try:
        candidate = service.merge_ai(await service.load_ai(session, base), body)
    except ValueError as exc:
        return TestResult(ok=False, message=str(exc))
    return await service.test_ai(candidate | {"enabled": True}, base)


def _kubeconfig_out(row: repository.StoredKubeconfig) -> KubeconfigOut:
    _, contexts, warnings = kubeconfigs.inspect(decrypt(row.content))
    return KubeconfigOut(
        id=row.id, name=row.name, contexts=contexts, warnings=warnings, created_at=row.created_at
    )


@router.get("/kubeconfigs", response_model=list[KubeconfigOut])
async def list_kubeconfigs(session: SessionDep) -> list[KubeconfigOut]:
    return [_kubeconfig_out(row) for row in await repository.list_kubeconfigs(session)]


@router.post("/kubeconfigs", response_model=KubeconfigOut, status_code=status.HTTP_201_CREATED)
async def add_kubeconfig(
    body: KubeconfigIn, session: SessionDep, admin: AdminUser
) -> KubeconfigOut:
    try:
        kubeconfigs.inspect(body.content)
    except kubeconfigs.InvalidKubeconfigError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    try:
        row = await repository.add_kubeconfig(session, body.name, encrypt(body.content))
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, f"'{body.name}' already exists") from exc
    await service.sync_uploaded_clusters(session)
    await audit.record(session, admin.username, "settings.kubeconfig.add", target=body.name)
    return _kubeconfig_out(row)


@router.delete("/kubeconfigs/{kubeconfig_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kubeconfig(kubeconfig_id: str, session: SessionDep, admin: AdminUser) -> None:
    if not await repository.delete_kubeconfig(session, kubeconfig_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kubeconfig not found")
    await service.sync_uploaded_clusters(session)
    await audit.record(session, admin.username, "settings.kubeconfig.delete", target=kubeconfig_id)


@router.get("/changes", response_model=ChangesSettings)
async def get_changes(session: SessionDep) -> ChangesSettings:
    return ChangesSettings(enabled=await service.changes_enabled(session))


@router.put("/changes", response_model=ChangesSettings)
async def put_changes(
    body: ChangesSettings, session: SessionDep, admin: AdminUser
) -> ChangesSettings:
    await repository.put_value(session, repository.CHANGES_KEY, {"enabled": body.enabled})
    await audit.record(
        session, admin.username, "settings.changes", detail="on" if body.enabled else "off"
    )
    return body


@router.get("/about", response_model=AboutOut)
async def about(base: SettingsDep) -> AboutOut:
    local = get_local_source()
    return AboutOut(
        version=__version__,
        database="PostgreSQL" if base.database_url.startswith("postgres") else "SQLite",
        secrets="Encrypted with KUBEIQ_SECRET_KEY"
        if base.secret_key
        else "Encrypted with a key generated on this server",
        local_kubeconfig=LocalKubeconfig(path=str(local.path), contexts=len(local.list_clusters())),
    )
