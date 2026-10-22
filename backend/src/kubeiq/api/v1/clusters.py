"""Cluster discovery endpoints."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from kubernetes.client import CoreV1Api

from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterStatus
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.core.k8s import REQUEST_TIMEOUT

router = APIRouter(prefix="/clusters", tags=["clusters"])

Registry = Annotated[ClusterRegistry, Depends(get_registry)]


class ClusterResponse(ClusterInfo):
    status: ClusterStatus | None = None


@router.get("", response_model=list[ClusterResponse])
async def list_clusters(
    registry: Registry,
    check: Annotated[bool, Query(description="Probe each cluster for reachability")] = True,
) -> list[ClusterResponse]:
    clusters = registry.list_clusters()
    statuses: list[ClusterStatus | None] = (
        list(await asyncio.gather(*(registry.check(c.id) for c in clusters)))
        if check
        else [None] * len(clusters)
    )
    return [
        ClusterResponse(**c.model_dump(), status=s) for c, s in zip(clusters, statuses, strict=True)
    ]


@router.get("/{cluster_id:path}/namespaces", response_model=list[str])
async def list_namespaces(cluster_id: str, registry: Registry) -> list[str]:
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
async def get_cluster(cluster_id: str, registry: Registry) -> ClusterResponse:
    try:
        cluster = registry.get_cluster(cluster_id)
        status = await registry.check(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ClusterResponse(**cluster.model_dump(), status=status)
