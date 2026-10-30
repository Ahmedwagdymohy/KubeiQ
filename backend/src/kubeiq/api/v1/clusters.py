"""Cluster discovery endpoints."""

import asyncio
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from kubernetes.client import CoreV1Api
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import membership
from kubeiq.auth.deps import CurrentUser
from kubeiq.clusters import meta
from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterStatus
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.db.session import get_session
from kubeiq.usage import history
from kubeiq.usage.summary import ClusterSummary, status_health, summarize

router = APIRouter(prefix="/clusters", tags=["clusters"])

Registry = Annotated[ClusterRegistry, Depends(get_registry)]


class ClusterResponse(ClusterInfo):
    status: ClusterStatus | None = None
    context: str  # the name in its source (kubeconfig context, GKE cluster); `name` may be renamed
    labels: list[meta.Label] = Field(default_factory=list)
    settings: meta.ClusterMeta = Field(default_factory=meta.ClusterMeta)
    added_at: datetime | None = None


def respond(
    cluster: ClusterInfo, row: meta.ClusterSetting | None, status: ClusterStatus | None
) -> ClusterResponse:
    settings = meta.to_meta(row)
    data = cluster.model_dump()
    data["name"] = settings.display_name or cluster.name
    data["namespace"] = settings.namespace or cluster.namespace
    return ClusterResponse(
        **data,
        status=status,
        context=cluster.name,
        labels=settings.labels,
        settings=settings,
        added_at=row.created_at if row else None,
    )


@router.get("", response_model=list[ClusterResponse])
async def list_clusters(
    registry: Registry,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    probe: Annotated[
        bool, Query(alias="check", description="Probe each cluster for reachability")
    ] = True,
    every: Annotated[
        bool, Query(alias="all", description="Admins: every connected cluster, not only projects'")
    ] = False,
) -> list[ClusterResponse]:
    if every and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can list every cluster")
    allowed = None if every else user.access.clusters()
    hidden = await membership.hidden(session)
    clusters = [
        c.model_copy(update={"hidden": c.id in hidden})
        for c in registry.list_clusters()
        if (allowed is None or c.id in allowed) and (every or c.id not in hidden)
    ]
    statuses: list[ClusterStatus | None] = (
        list(await asyncio.gather(*(registry.check(c.id) for c in clusters)))
        if probe
        else [None] * len(clusters)
    )
    rows = await meta.seen(session, [c.id for c in clusters])
    return [respond(c, rows.get(c.id), s) for c, s in zip(clusters, statuses, strict=True)]


@router.get("/{cluster_id:path}/namespaces", response_model=list[str])
async def list_namespaces(cluster_id: str, registry: Registry, user: CurrentUser) -> list[str]:
    clusters = user.access.clusters()
    # Admins reach any connected cluster, to add it to a project; lists show projects' only.
    if not user.is_admin and clusters is not None and cluster_id not in clusters:
        raise HTTPException(status_code=403, detail="Your projects do not include this cluster")
    allowed = user.access.namespaces(cluster_id)
    if allowed is not None:
        return sorted(allowed)
    try:
        api = registry.api_client(cluster_id)
        result = await asyncio.to_thread(
            CoreV1Api(api).list_namespace, _request_timeout=REQUEST_TIMEOUT
        )
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=describe_error(exc)) from exc
    return sorted(ns.metadata.name for ns in result.items if ns.metadata and ns.metadata.name)


@router.get("/{cluster_id:path}/summary", response_model=ClusterSummary)
async def cluster_summary(cluster_id: str, registry: Registry, user: CurrentUser) -> ClusterSummary:
    """Health for the status bar: reachable and readable, node readiness, usage."""
    allowed = user.access.clusters()
    if not user.is_admin and allowed is not None and cluster_id not in allowed:
        raise HTTPException(status_code=403, detail="Your projects do not include this cluster")
    try:
        probe = await registry.check(cluster_id)
        api = registry.api_client(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    broken = status_health(probe)
    # Nodes are cluster-wide: members limited to some namespaces see the connection state only.
    if broken or not user.access.can("read", cluster_id, None):
        return ClusterSummary(health=broken or "healthy", reason=probe.error, version=probe.version)
    try:
        return await asyncio.to_thread(summarize, api, probe)
    except Exception as exc:
        return ClusterSummary(health="healthy", version=probe.version, reason=describe_error(exc))


@router.get("/{cluster_id:path}/usage", response_model=list[history.UsagePoint])
async def cluster_usage(
    cluster_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    hours: Annotated[int, Query(ge=1, le=168)] = 24,
) -> list[history.UsagePoint]:
    """Recorded usage for trend lines: measured samples only, oldest first."""
    if not user.access.can("read", cluster_id, None):
        raise HTTPException(status_code=403, detail="Usage covers the whole cluster")
    return await history.points(session, cluster_id, hours)


# Declared last: the greedy path parameter would otherwise capture ".../namespaces".
@router.get("/{cluster_id:path}", response_model=ClusterResponse)
async def get_cluster(
    cluster_id: str,
    registry: Registry,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ClusterResponse:
    allowed = user.access.clusters()
    if not user.is_admin and allowed is not None and cluster_id not in allowed:
        raise HTTPException(status_code=403, detail="Your projects do not include this cluster")
    try:
        cluster = registry.get_cluster(cluster_id)
        probe = await registry.check(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    rows = await meta.seen(session, [cluster_id])
    return respond(cluster, rows.get(cluster_id), probe)
