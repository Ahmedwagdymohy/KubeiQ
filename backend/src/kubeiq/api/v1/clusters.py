"""Cluster discovery endpoints."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterStatus
from kubeiq.clusters.registry import ClusterRegistry, get_registry

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


@router.get("/{cluster_id:path}", response_model=ClusterResponse)
async def get_cluster(cluster_id: str, registry: Registry) -> ClusterResponse:
    try:
        cluster = registry.get_cluster(cluster_id)
        status = await registry.check(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ClusterResponse(**cluster.model_dump(), status=status)
