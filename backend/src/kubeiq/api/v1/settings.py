"""Settings API: AI model and kubeconfig files. Secrets are write-only."""

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq import __version__
from kubeiq.auth import google
from kubeiq.auth import repository as audit
from kubeiq.auth.deps import AdminUser, require_admin
from kubeiq.clusters.gke import GkeSource
from kubeiq.clusters.registry import get_gke_source, get_local_source
from kubeiq.core.config import Settings, get_settings
from kubeiq.db.session import get_session
from kubeiq.settings import kubeconfigs, repository, service
from kubeiq.settings.crypto import decrypt, encrypt
from kubeiq.settings.models import (
    AboutOut,
    AISettingsIn,
    AISettingsOut,
    ChangesSettings,
    GkeSettingsIn,
    GkeSettingsOut,
    GoogleSettingsIn,
    GoogleSettingsOut,
    KubeconfigIn,
    KubeconfigOut,
    LocalKubeconfig,
    TestResult,
)
from kubeiq.settings.providers import PROVIDERS, Provider

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_admin)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
GkeDep = Annotated[GkeSource, Depends(get_gke_source)]


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


async def _gke_view(gke: GkeSource) -> GkeSettingsOut:
    identity = await asyncio.to_thread(gke.identity)
    return GkeSettingsOut(identity=identity, projects=gke.status())


@router.get("/gke", response_model=GkeSettingsOut)
async def get_gke(gke: GkeDep) -> GkeSettingsOut:
    return await _gke_view(gke)


@router.put("/gke", response_model=GkeSettingsOut)
async def put_gke(
    body: GkeSettingsIn, session: SessionDep, gke: GkeDep, admin: AdminUser
) -> GkeSettingsOut:
    """Save the Google Cloud projects to read GKE clusters from, and list their clusters now."""
    unique = list({p.project_id: p for p in body.projects}.values())
    await repository.put_value(
        session, repository.GKE_KEY, {"projects": [p.model_dump() for p in unique]}
    )
    gke.set_projects(unique)
    await asyncio.to_thread(gke.discover)
    await audit.record(
        session,
        admin.username,
        "settings.gke",
        detail=", ".join(p.project_id for p in unique) or None,
    )
    return await _gke_view(gke)


def _google_view(saved: dict[str, Any], request: Request) -> GoogleSettingsOut:
    secret = saved["client_secret"]
    return GoogleSettingsOut(
        enabled=saved["enabled"],
        client_id=saved["client_id"],
        client_secret_set=bool(secret),
        client_secret_hint=decrypt(secret)[-4:] if secret else None,
        redirect_uri=str(request.url_for("google_callback")),
    )


@router.get("/google", response_model=GoogleSettingsOut)
async def get_google(request: Request, session: SessionDep) -> GoogleSettingsOut:
    return _google_view(await google.load_settings(session), request)


@router.put("/google", response_model=GoogleSettingsOut)
async def put_google(
    body: GoogleSettingsIn, request: Request, session: SessionDep, admin: AdminUser
) -> GoogleSettingsOut:
    """Sign in with Google: the OAuth client. Only people allowed under Users can sign in."""
    current = await google.load_settings(session)
    saved = {
        "enabled": body.enabled,
        "client_id": body.client_id.strip(),
        "client_secret": current["client_secret"]
        if body.client_secret is None
        else (encrypt(body.client_secret.strip()) if body.client_secret.strip() else None),
    }
    if saved["enabled"] and not (saved["client_id"] and saved["client_secret"]):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Add the client ID and secret to turn it on"
        )
    await repository.put_value(session, repository.GOOGLE_KEY, saved)
    await audit.record(
        session, admin.username, "settings.google", detail="on" if saved["enabled"] else "off"
    )
    return _google_view(saved, request)


@router.get("/about", response_model=AboutOut)
async def about(base: SettingsDep) -> AboutOut:
    local = get_local_source()
    return AboutOut(
        version=__version__,
        database="PostgreSQL" if base.database_url.startswith("postgres") else "SQLite",
        secrets="Encrypted with KUBEIQ_SECRET_KEY"
        if base.secret_key
        else "Encrypted with a key generated on this server",
        local_kubeconfig=LocalKubeconfig(
            path=str(local.path), contexts=len(local.list_clusters()), error=local.error
        ),
    )
