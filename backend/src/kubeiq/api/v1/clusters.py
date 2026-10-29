"""Cluster discovery endpoints."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from kubernetes.client import CoreV1Api
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import membership
from kubeiq.auth.deps import CurrentUser
from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterStatus
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.db.session import get_session

router = APIRouter(prefix="/clusters", tags=["clusters"])

Registry = Annotated[ClusterRegistry, Depends(get_registry)]


class ClusterResponse(ClusterInfo):
    status: ClusterStatus | None = None


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
    return [
        ClusterResponse(**c.model_dump(), status=s) for c, s in zip(clusters, statuses, strict=True)
    ]


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


# Declared last: the greedy path parameter would otherwise capture ".../namespaces".
@router.get("/{cluster_id:path}", response_model=ClusterResponse)
async def get_cluster(cluster_id: str, registry: Registry, user: CurrentUser) -> ClusterResponse:
    allowed = user.access.clusters()
    if not user.is_admin and allowed is not None and cluster_id not in allowed:
        raise HTTPException(status_code=403, detail="Your projects do not include this cluster")
    try:
        cluster = registry.get_cluster(cluster_id)
        probe = await registry.check(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ClusterResponse(**cluster.model_dump(), status=probe)
