"""Cluster Manager API. Reads follow project access; changes are opt-in and audited."""

import asyncio
from collections.abc import Callable
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from kubernetes.client import ApiClient
from kubernetes.client.exceptions import ApiException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from kubeiq.auth import repository as audit
from kubeiq.auth.deps import CurrentUser, Principal, check
from kubeiq.clusters import meta
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.db.session import get_session
from kubeiq.products.manager import actions, edit, resources, shell, watch
from kubeiq.products.manager.discovery import discover
from kubeiq.products.manager.kube import InvalidPathError, resource_path
from kubeiq.products.manager.models import (
    Action,
    ActionResult,
    Category,
    KubeEvent,
    ObjectDetail,
    PodLogs,
    ResourceList,
    SearchHit,
    WorkloadPod,
)
from kubeiq.settings.service import changes_enabled

router = APIRouter(prefix="/manager", tags=["manager"])

Registry = Annotated[ClusterRegistry, Depends(get_registry)]
ClusterId = Annotated[str, Query(min_length=1)]
T = TypeVar("T")


def _client(registry: ClusterRegistry, cluster_id: str) -> ApiClient:
    try:
        return registry.api_client(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


async def _call[T](fn: Callable[..., T], *args: Any) -> T:
    try:
        return await asyncio.to_thread(fn, *args)
    except InvalidPathError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ApiException as exc:
        if exc.status == 404:
            raise HTTPException(status_code=404, detail="Not found in the cluster") from exc
        raise HTTPException(status_code=502, detail=describe_error(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=describe_error(exc)) from exc


def _see_cluster(user: Principal, cluster_id: str) -> None:
    allowed = user.access.clusters()
    if allowed is not None and cluster_id not in allowed:
        raise HTTPException(status_code=403, detail="Your projects do not include this cluster")


@router.get("/resources", response_model=list[Category])
async def list_kinds(
    registry: Registry, user: CurrentUser, cluster_id: ClusterId, refresh: bool = False
) -> list[Category]:
    _see_cluster(user, cluster_id)
    api = _client(registry, cluster_id)
    try:
        return await discover(cluster_id, api, refresh)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=describe_error(exc)) from exc


@router.get("/search", response_model=list[SearchHit])
async def search(
    registry: Registry,
    user: CurrentUser,
    cluster_id: ClusterId,
    q: Annotated[str, Query(min_length=1, max_length=100)],
) -> list[SearchHit]:
    """Find objects by name for the command palette, within what the user may read."""
    _see_cluster(user, cluster_id)
    allowed = user.access.namespaces(cluster_id)
    api = _client(registry, cluster_id)
    scope = None if allowed is None else sorted(allowed)
    return await _call(resources.search, cluster_id, api, q, scope)


@router.get("/list", response_model=ResourceList)
async def list_objects(
    registry: Registry,
    user: CurrentUser,
    cluster_id: ClusterId,
    version: str,
    resource: str,
    group: str = "",
    namespace: str | None = None,
) -> ResourceList:
    check(user, "read", cluster_id, namespace or None)
    api = _client(registry, cluster_id)
    return await _call(resources.list_resources, api, group, version, resource, namespace or None)


@router.get("/watch")
async def watch_objects(
    request: Request,
    registry: Registry,
    user: CurrentUser,
    cluster_id: ClusterId,
    version: str,
    resource: str,
    group: str = "",
    namespace: str | None = None,
) -> EventSourceResponse:
    """Server-sent events when objects of a kind change, batched, so lists update live."""
    check(user, "read", cluster_id, namespace or None)
    api = _client(registry, cluster_id)
    try:
        resource_path(group, version, resource, namespace or None)
    except InvalidPathError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    stream = watch.changes(
        api, group, version, resource, namespace or None, request.is_disconnected
    )
    return EventSourceResponse(stream, ping=15)


@router.get("/object", response_model=ObjectDetail)
async def get_object(
    registry: Registry,
    user: CurrentUser,
    cluster_id: ClusterId,
    version: str,
    resource: str,
    name: str,
    group: str = "",
    namespace: str | None = None,
) -> ObjectDetail:
    check(user, "read", cluster_id, namespace or None)
    api = _client(registry, cluster_id)
    return await _call(resources.get_object, api, group, version, resource, namespace or None, name)


@router.get("/events", response_model=list[KubeEvent])
async def object_events(
    registry: Registry,
    user: CurrentUser,
    cluster_id: ClusterId,
    kind: str,
    name: str,
    namespace: str | None = None,
) -> list[KubeEvent]:
    check(user, "read", cluster_id, namespace or None)
    api = _client(registry, cluster_id)
    return await _call(resources.events_for, api, kind, namespace or None, name)


@router.get("/feed", response_model=list[KubeEvent])
async def event_feed(
    registry: Registry,
    user: CurrentUser,
    cluster_id: ClusterId,
    namespace: str | None = None,
    warnings: bool = False,
    limit: Annotated[int, Query(ge=1, le=resources.FEED_LIMIT)] = 50,
) -> list[KubeEvent]:
    """The cluster's newest events, within the namespaces the user may read."""
    _see_cluster(user, cluster_id)
    if namespace:
        check(user, "read", cluster_id, namespace)
        scope: list[str] | None = [namespace]
    else:
        allowed = user.access.namespaces(cluster_id)
        scope = None if allowed is None else sorted(allowed)
    api = _client(registry, cluster_id)
    return await _call(resources.recent_events, api, scope, warnings, limit)


@router.get("/logs", response_model=PodLogs)
async def logs(
    registry: Registry,
    user: CurrentUser,
    cluster_id: ClusterId,
    namespace: str,
    pod: str,
    container: str | None = None,
    tail: Annotated[int, Query(ge=1, le=resources.MAX_LOG_LINES)] = 500,
    previous: bool = False,
) -> PodLogs:
    check(user, "read", cluster_id, namespace)
    api = _client(registry, cluster_id)
    return await _call(resources.pod_logs, api, namespace, pod, container, tail, previous)


@router.get("/pods", response_model=list[WorkloadPod])
async def pods_of(
    registry: Registry,
    user: CurrentUser,
    cluster_id: ClusterId,
    version: str,
    resource: str,
    namespace: str,
    name: str,
    group: str = "",  # empty for the core group (Services); clients omit empty parameters
) -> list[WorkloadPod]:
    """The pods of a workload or Service, to read their logs from its own panel."""
    check(user, "read", cluster_id, namespace)
    api = _client(registry, cluster_id)
    return await _call(resources.workload_pods, api, group, version, resource, namespace, name)


async def allow_change(
    session: AsyncSession,
    registry: ClusterRegistry,
    user: Principal,
    cluster_id: str,
    namespace: str | None,
    confirm: str | None,
) -> None:
    """ADR 0009: changes are on, the user may edit here, and production names are typed."""
    if not await changes_enabled(session):
        raise HTTPException(
            status_code=403,
            detail="Cluster changes are turned off. An admin can turn them on in Settings",
        )
    check(user, "edit", cluster_id, namespace)
    settings = await meta.get(session, cluster_id)
    if settings.production:
        try:
            name = settings.display_name or registry.get_cluster(cluster_id).name
        except ClusterNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if (confirm or "").strip() != name:
            raise HTTPException(
                status_code=422,
                detail=f"{name} is a production cluster. Type its name to confirm this change",
            )


class ApplyIn(BaseModel):
    cluster_id: str
    yaml: str
    namespace: str | None = None
    # The object being edited; None creates a new one.
    existing: str | None = None
    dry_run: bool = True
    confirm: str | None = None


@router.post("/apply", response_model=edit.ApplyResult)
async def apply_yaml(
    body: ApplyIn,
    registry: Registry,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> edit.ApplyResult:
    """Edit an object or create one from YAML. A dry run validates first and changes nothing."""
    try:
        obj = edit.parse(body.yaml)
    except edit.EditError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    namespace = (obj.get("metadata") or {}).get("namespace") or body.namespace
    await allow_change(session, registry, user, body.cluster_id, namespace, body.confirm)
    api = _client(registry, body.cluster_id)
    try:
        kinds = [k for c in await discover(body.cluster_id, api) for k in c.kinds]
        kind = edit.kind_of(obj, kinds)
    except edit.EditError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=describe_error(exc)) from exc
    target = f"{kind.resource}/{obj['metadata']['name']}"
    action = "k8s.edit" if body.existing else "k8s.create"
    try:
        result = await _call(edit.apply, api, kind, obj, namespace, body.existing, body.dry_run)
    except edit.EditError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException as exc:
        if not body.dry_run:
            await audit.record(
                session,
                user.username,
                action,
                target=target,
                cluster_id=body.cluster_id,
                namespace=namespace,
                detail=str(exc.detail),
                ok=False,
            )
        if exc.status_code == 502 and "409" in str(exc.detail):
            raise HTTPException(
                status_code=409, detail="It changed since you opened it. Reload and edit again"
            ) from exc
        raise
    if not body.dry_run:
        await audit.record(
            session,
            user.username,
            action,
            target=target,
            cluster_id=body.cluster_id,
            namespace=result.namespace,
        )
    return result


@router.get("/files", response_model=shell.Listing)
async def list_files(
    registry: Registry,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    cluster_id: ClusterId,
    namespace: str,
    pod: str,
    container: str,
    path: str = "/",
) -> shell.Listing:
    """Browse a container's files: the same permission as the terminal."""
    await allow_change(session, registry, user, cluster_id, namespace, None)
    api = _client(registry, cluster_id)
    try:
        return await _call(shell.list_dir, api, namespace, pod, container, path)
    except shell.ShellError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/files/download")
async def download_file(
    registry: Registry,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    cluster_id: ClusterId,
    namespace: str,
    pod: str,
    container: str,
    path: str,
) -> Response:
    await allow_change(session, registry, user, cluster_id, namespace, None)
    api = _client(registry, cluster_id)
    target = f"pods/{pod}:{path}"
    try:
        data = await _call(shell.read_file, api, namespace, pod, container, path)
    except shell.ShellError as exc:
        await audit.record(
            session,
            user.username,
            "k8s.download",
            target=target,
            cluster_id=cluster_id,
            namespace=namespace,
            detail=str(exc),
            ok=False,
        )
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await audit.record(
        session,
        user.username,
        "k8s.download",
        target=target,
        cluster_id=cluster_id,
        namespace=namespace,
    )
    filename = path.rstrip("/").rsplit("/", 1)[-1] or "file"
    return Response(
        data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/actions", response_model=ActionResult)
async def run_action(
    body: Action,
    registry: Registry,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ActionResult:
    await allow_change(session, registry, user, body.cluster_id, body.namespace, body.confirm)
    try:
        actions.validate(body)
    except actions.UnsupportedActionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    api = _client(registry, body.cluster_id)
    target = f"{body.resource}/{body.name}"
    try:
        message = await _call(actions.run, api, body)
    except HTTPException as exc:
        await audit.record(
            session,
            user.username,
            f"k8s.{body.action}",
            target=target,
            cluster_id=body.cluster_id,
            namespace=body.namespace,
            detail=str(exc.detail),
            ok=False,
        )
        raise
    await audit.record(
        session,
        user.username,
        f"k8s.{body.action}",
        target=target,
        cluster_id=body.cluster_id,
        namespace=body.namespace,
        detail=actions.describe(body) or None,
    )
    return ActionResult(ok=True, message=message)
