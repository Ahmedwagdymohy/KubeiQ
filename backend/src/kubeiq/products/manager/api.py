"""Cluster Manager API. Reads follow project access; changes are opt-in and audited."""

import asyncio
from collections.abc import Callable
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query
from kubernetes.client import ApiClient
from kubernetes.client.exceptions import ApiException
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import repository as audit
from kubeiq.auth.deps import CurrentUser, Principal, check
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.db.session import get_session
from kubeiq.products.manager import actions, resources
from kubeiq.products.manager.discovery import discover
from kubeiq.products.manager.kube import InvalidPathError
from kubeiq.products.manager.models import (
    Action,
    ActionResult,
    Category,
    KubeEvent,
    ObjectDetail,
    PodLogs,
    ResourceList,
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


@router.post("/actions", response_model=ActionResult)
async def run_action(
    body: Action,
    registry: Registry,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ActionResult:
    if not await changes_enabled(session):
        raise HTTPException(
            status_code=403,
            detail="Cluster changes are turned off. An admin can turn them on in Settings",
        )
    check(user, "edit", body.cluster_id, body.namespace)
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
