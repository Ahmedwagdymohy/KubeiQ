"""Settings API: AI model and kubeconfig files. Secrets are write-only."""

import asyncio
import os
import platform
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from kubernetes.client import VersionApi
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq import __version__
from kubeiq.auth import google, membership
from kubeiq.auth import repository as audit
from kubeiq.auth import repository as auth_repository
from kubeiq.auth.deps import AdminUser, require_admin
from kubeiq.clusters import meta
from kubeiq.clusters.base import ClusterStatus
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.gke import (
    GkeClusterCheck,
    GkeError,
    GkeProject,
    GkeProjectCheck,
    GkeSource,
)
from kubeiq.clusters.registry import (
    PROBE_TIMEOUT_SECONDS,
    get_gke_source,
    get_local_source,
    get_registry,
    get_token_source,
    get_uploaded_source,
    probe_read,
    test_client,
)
from kubeiq.clusters.token import TokenClusterIn
from kubeiq.core.config import Settings, get_settings
from kubeiq.db.models import (
    DEFAULT_ORG,
    AppSetting,
    AssistantConversation,
    AssistantMessage,
    AuditEvent,
    ClusterSetting,
    ConnectCode,
    IncidentMessage,
    Investigation,
    InvestigationEvent,
    Project,
    ProjectMember,
    UsageSample,
    UserPreference,
)
from kubeiq.db.session import get_session
from kubeiq.notifications import service as notify
from kubeiq.notifications.models import Alert, ChannelIn, ClusterAlerts, NotificationsOut, Rules
from kubeiq.settings import kubeconfigs, repository, service
from kubeiq.settings.crypto import decrypt, encrypt
from kubeiq.settings.models import (
    AboutOut,
    AISettingsIn,
    AISettingsOut,
    ChangesSettings,
    DangerIn,
    GkeSettingsIn,
    GkeSettingsOut,
    GoogleSettingsIn,
    GoogleSettingsOut,
    KubeconfigIn,
    KubeconfigOut,
    LocalKubeconfig,
    TestResult,
    WorkspaceSettings,
)
from kubeiq.settings.providers import PROVIDERS, Provider

STARTED_AT = datetime.now(UTC)

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
    contexts = kubeconfigs.inspect(body.content)[1]
    ids = [get_uploaded_source().make_id(f"{body.name}/{c}") for c in contexts]
    await membership.add_to_project(session, body.project_id, ids)
    return _kubeconfig_out(row)


@router.delete("/kubeconfigs/{kubeconfig_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kubeconfig(kubeconfig_id: str, session: SessionDep, admin: AdminUser) -> None:
    if not await repository.delete_kubeconfig(session, kubeconfig_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kubeconfig not found")
    await service.sync_uploaded_clusters(session)
    await audit.record(session, admin.username, "settings.kubeconfig.delete", target=kubeconfig_id)


class Visibility(BaseModel):
    cluster_id: str = Field(max_length=512)
    hidden: bool


@router.put("/clusters/hidden", status_code=status.HTTP_204_NO_CONTENT)
async def hide_cluster(body: Visibility, session: SessionDep, admin: AdminUser) -> None:
    """Hide a cluster KubeiQ should not use (server kubeconfig contexts cannot be removed)."""
    await membership.set_hidden(session, body.cluster_id, body.hidden)
    await audit.record(
        session,
        admin.username,
        "settings.cluster.hide" if body.hidden else "settings.cluster.show",
        cluster_id=body.cluster_id,
    )


class ClusterMetaIn(meta.ClusterMeta):
    cluster_id: str = Field(min_length=1, max_length=512)


@router.put("/clusters/meta", response_model=meta.ClusterMeta)
async def put_cluster_meta(
    body: ClusterMetaIn, session: SessionDep, admin: AdminUser
) -> meta.ClusterMeta:
    """A cluster's display name, labels, default namespace and usage thresholds."""
    settings = meta.ClusterMeta(**body.model_dump(exclude={"cluster_id"}))
    await meta.save(session, body.cluster_id, settings)
    await audit.record(
        session,
        admin.username,
        "settings.cluster.edit",
        cluster_id=body.cluster_id,
        detail=", ".join(label.name for label in settings.labels) or None,
    )
    return settings


async def _token_entry(session: AsyncSession, name: str) -> dict[str, Any] | None:
    return next((e for e in await service.load_token_clusters(session) if e["name"] == name), None)


async def _test_token(body: TokenClusterIn, token: str) -> ClusterStatus:
    client = get_token_source().client_for(body.name, body.server, token, body.ca)
    return await test_client(client, PROBE_TIMEOUT_SECONDS + 2)


@router.post("/token-clusters/test", response_model=ClusterStatus)
async def test_token_cluster(body: TokenClusterIn, session: SessionDep) -> ClusterStatus:
    """Test an API server + token before saving: reachable, trusted and readable."""
    saved = await _token_entry(session, body.name)
    token = body.token or (decrypt(saved["token"]) if saved else None)
    if not token:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Paste the token to test it")
    return await _test_token(body, token)


def _usable(result: ClusterStatus) -> None:
    if not result.reachable:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, result.error or "Unreachable")
    if result.can_read is False:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "The token works but cannot read the cluster. Bind it to the kubeiq-readonly role",
        )


@router.post("/token-clusters", response_model=ClusterStatus, status_code=status.HTTP_201_CREATED)
async def add_token_cluster(
    body: TokenClusterIn, session: SessionDep, admin: AdminUser
) -> ClusterStatus:
    """Connect with an API server address and a ServiceAccount token, tested before saving."""
    if await _token_entry(session, body.name):
        raise HTTPException(status.HTTP_409_CONFLICT, f"'{body.name}' already exists")
    if not body.token:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Paste the token")
    result = await _test_token(body, body.token)
    _usable(result)
    entries = await service.load_token_clusters(session)
    entries.append(
        {
            "name": body.name,
            "server": body.server,
            "token": encrypt(body.token),
            "ca": body.ca,
            "namespace": body.namespace,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )
    await service.save_token_clusters(session, entries)
    cluster_id = get_token_source().make_id(body.name)
    await membership.add_to_project(session, body.project_id, [cluster_id])
    await audit.record(session, admin.username, "settings.cluster.add", cluster_id=cluster_id)
    return result


@router.put("/token-clusters/{name}", response_model=ClusterStatus)
async def update_token_cluster(
    name: str, body: TokenClusterIn, session: SessionDep, admin: AdminUser
) -> ClusterStatus:
    """Replace the address, token or CA. A missing token keeps the saved one."""
    saved = await _token_entry(session, name)
    if saved is None or body.name != name:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")
    token = body.token or decrypt(saved["token"])
    result = await _test_token(body, token)
    _usable(result)
    saved.update(server=body.server, token=encrypt(token), ca=body.ca, namespace=body.namespace)
    entries = [
        saved if e["name"] == name else e for e in await service.load_token_clusters(session)
    ]
    await service.save_token_clusters(session, entries)
    await audit.record(session, admin.username, "settings.cluster.edit", cluster_id=f"token:{name}")
    return result


@router.delete("/token-clusters/{name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_token_cluster(name: str, session: SessionDep, admin: AdminUser) -> None:
    entries = await service.load_token_clusters(session)
    kept = [e for e in entries if e["name"] != name]
    if len(kept) == len(entries):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")
    await service.save_token_clusters(session, kept)
    cluster_id = get_token_source().make_id(name)
    await membership.remove(session, cluster_id)
    await meta.forget(session, cluster_id)
    await audit.record(session, admin.username, "settings.cluster.remove", cluster_id=cluster_id)


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
    known = {c.id for c in gke.list_clusters()}
    gke.set_projects(unique)
    await asyncio.to_thread(gke.discover)
    found = [c.id for c in gke.list_clusters() if c.id not in known]
    await membership.add_to_project(session, None, found)
    await audit.record(
        session,
        admin.username,
        "settings.gke",
        detail=", ".join(p.project_id for p in unique) or None,
    )
    return await _gke_view(gke)


@router.post("/gke/check", response_model=GkeProjectCheck)
async def check_gke(body: GkeProject, gke: GkeDep) -> GkeProjectCheck:
    """Before a project is added: can KubeiQ list its clusters, reach them and read them?"""
    try:
        found = await asyncio.to_thread(gke.preview, body)
    except GkeError as exc:
        return GkeProjectCheck(project_id=body.project_id, error=str(exc))

    async def check(cluster: Any, client: Any) -> GkeClusterCheck:
        result = GkeClusterCheck(name=cluster.name, location=cluster.location)
        try:
            info = await asyncio.to_thread(
                VersionApi(client).get_code, _request_timeout=PROBE_TIMEOUT_SECONDS
            )
        except Exception as exc:
            result.error = describe_error(exc, f"https://{cluster.server}")
            return result
        status_ = await probe_read(client, ClusterStatus(reachable=True, version=info.git_version))
        return result.model_copy(
            update=status_.model_dump(include={"reachable", "version", "can_read"})
        )

    clusters = await asyncio.gather(*(check(c, client) for c, client in found))
    return GkeProjectCheck(project_id=body.project_id, clusters=list(clusters))


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


@router.get("/notifications", response_model=NotificationsOut)
async def get_notifications(session: SessionDep) -> NotificationsOut:
    return notify.view(await notify.load(session))


@router.post("/notifications/channels", response_model=NotificationsOut)
async def save_channel(body: ChannelIn, session: SessionDep, admin: AdminUser) -> NotificationsOut:
    """Add a channel, or replace one (by id). Secrets left out keep their saved values."""
    doc = await notify.load(session)
    existing = next((c for c in doc["channels"] if c["id"] == body.id), None) if body.id else None
    if body.id and existing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Channel not found")
    try:
        channel = notify.merge_channel(existing, body)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    doc["channels"] = [channel if c["id"] == channel["id"] else c for c in doc["channels"]]
    if existing is None:
        doc["channels"].append(channel)
    await repository.put_value(session, notify.KEY, doc)
    await audit.record(
        session, admin.username, "settings.notifications.channel", target=channel["name"]
    )
    return notify.view(doc)


@router.delete("/notifications/channels/{channel_id}", response_model=NotificationsOut)
async def delete_channel(
    channel_id: str, session: SessionDep, admin: AdminUser
) -> NotificationsOut:
    doc = await notify.load(session)
    doc["channels"] = [c for c in doc["channels"] if c["id"] != channel_id]
    await repository.put_value(session, notify.KEY, doc)
    await audit.record(
        session, admin.username, "settings.notifications.channel.delete", target=channel_id
    )
    return notify.view(doc)


@router.put("/notifications/rules", response_model=NotificationsOut)
async def save_rules(body: Rules, session: SessionDep, admin: AdminUser) -> NotificationsOut:
    doc = await notify.load(session)
    doc["rules"] = body.model_dump()
    await repository.put_value(session, notify.KEY, doc)
    await audit.record(session, admin.username, "settings.notifications.rules")
    return notify.view(doc)


class ChannelTest(BaseModel):
    channel_id: str


@router.post("/notifications/test", response_model=TestResult)
async def test_channel(body: ChannelTest, session: SessionDep, admin: AdminUser) -> TestResult:
    doc = await notify.load(session)
    channel = next((c for c in doc["channels"] if c["id"] == body.channel_id), None)
    if channel is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Channel not found")
    alert = Alert(
        key="test",
        rule="cluster.unreachable",
        cluster_id=None,
        cluster=None,
        title="KubeiQ test message",
        text=f"Sent by {admin.username} from Settings. Alerts will look like this.",
    )
    error = await notify.deliver(channel, alert)
    return TestResult(ok=error is None, message=error or "Sent")


class ClusterAlertsIn(ClusterAlerts):
    cluster_id: str = Field(min_length=1, max_length=512)


@router.get("/clusters/alerts", response_model=ClusterAlerts)
async def get_cluster_alerts(cluster_id: str, session: SessionDep) -> ClusterAlerts:
    return notify.routing(await session.get(ClusterSetting, (DEFAULT_ORG, cluster_id)))


@router.put("/clusters/alerts", response_model=ClusterAlerts)
async def put_cluster_alerts(
    body: ClusterAlertsIn, session: SessionDep, admin: AdminUser
) -> ClusterAlerts:
    """Which channels a cluster sends to, and for which rules (None: all)."""
    rows = await meta.seen(session, [body.cluster_id])
    routing = ClusterAlerts(channels=body.channels, events=body.events)
    rows[body.cluster_id].alerts = routing.model_dump()
    await session.commit()
    await audit.record(
        session, admin.username, "settings.cluster.alerts", cluster_id=body.cluster_id
    )
    return routing


@router.get("/general", response_model=WorkspaceSettings)
async def get_general(session: SessionDep) -> WorkspaceSettings:
    return WorkspaceSettings(**(await repository.get_value(session, repository.GENERAL_KEY) or {}))


@router.put("/general", response_model=WorkspaceSettings)
async def put_general(
    body: WorkspaceSettings, session: SessionDep, admin: AdminUser
) -> WorkspaceSettings:
    await repository.put_value(session, repository.GENERAL_KEY, body.model_dump())
    await audit.record(session, admin.username, "settings.general")
    return body


def _confirm(body: DangerIn, phrase: str) -> None:
    if body.confirm.strip().lower() != phrase:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f'Type "{phrase}" to confirm')


@router.post("/danger/clear-activity", status_code=status.HTTP_204_NO_CONTENT)
async def clear_activity(body: DangerIn, session: SessionDep, admin: AdminUser) -> None:
    """Delete the activity log. The clearing itself is recorded as the first new entry."""
    _confirm(body, "clear activity")
    await session.execute(delete(AuditEvent).where(AuditEvent.org_id == DEFAULT_ORG))
    await session.commit()
    await audit.record(session, admin.username, "settings.activity.clear")


async def _remove_clusters(session: AsyncSession) -> int:
    """Remove every cluster added in Settings (files, tokens, GKE projects) and take all
    clusters out of the projects. The server's own kubeconfig cannot be removed here."""
    removed = 0
    for row in await repository.list_kubeconfigs(session):
        await session.delete(row)
        removed += 1
    await session.commit()
    await service.sync_uploaded_clusters(session)
    tokens = await service.load_token_clusters(session)
    removed += len(tokens)
    await service.save_token_clusters(session, [])
    await repository.put_value(session, repository.GKE_KEY, {"projects": []})
    get_gke_source().set_projects([])
    for project in await auth_repository.list_projects(session):
        project.scopes = []
    await session.execute(delete(ClusterSetting).where(ClusterSetting.org_id == DEFAULT_ORG))
    await session.commit()
    return removed


@router.post("/danger/remove-clusters", status_code=status.HTTP_204_NO_CONTENT)
async def remove_clusters(body: DangerIn, session: SessionDep, admin: AdminUser) -> None:
    _confirm(body, "remove clusters")
    removed = await _remove_clusters(session)
    await audit.record(session, admin.username, "settings.clusters.remove-all", detail=str(removed))


@router.post("/danger/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_workspace(
    body: DangerIn, session: SessionDep, admin: AdminUser, base: SettingsDep
) -> None:
    """Back to a fresh install: clusters, projects, users (except the built-in admin), settings,
    investigations and conversations go. The activity log stays, with this reset in it."""
    _confirm(body, "reset workspace")
    await _remove_clusters(session)
    for model in (
        IncidentMessage,
        InvestigationEvent,
        Investigation,
        AssistantMessage,
        AssistantConversation,
        UsageSample,
        UserPreference,
        ConnectCode,
        ProjectMember,
        Project,
    ):
        await session.execute(delete(model))
    await session.execute(delete(AppSetting).where(AppSetting.org_id == DEFAULT_ORG))
    for user in await auth_repository.list_users(session):
        if user.username != base.admin_username:
            await auth_repository.delete_user_sessions(session, user.id)
            await session.delete(user)
    await session.commit()
    await audit.record(session, admin.username, "settings.reset")


@router.get("/about", response_model=AboutOut)
async def about(base: SettingsDep, session: SessionDep) -> AboutOut:
    local = get_local_source()
    return AboutOut(
        build=os.environ.get("KUBEIQ_BUILD") or None,
        started_at=STARTED_AT,
        python=platform.python_version(),
        clusters=len(get_registry().list_clusters()),
        users=await auth_repository.count_users(session),
        version=__version__,
        database="PostgreSQL" if base.database_url.startswith("postgres") else "SQLite",
        secrets="Encrypted with KUBEIQ_SECRET_KEY"
        if base.secret_key
        else "Encrypted with a key generated on this server",
        local_kubeconfig=LocalKubeconfig(
            path=str(local.path), contexts=len(local.list_clusters()), error=local.error
        ),
    )
