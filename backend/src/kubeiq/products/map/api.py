"""Cluster Map API."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from kubeiq.auth.deps import CurrentUser, check
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.collectors.models import Scope
from kubeiq.products.map.models import ClusterMap
from kubeiq.products.map.service import cluster_map

router = APIRouter(prefix="/map", tags=["map"])


@router.get("", response_model=ClusterMap)
async def get_map(
    registry: Annotated[ClusterRegistry, Depends(get_registry)],
    user: CurrentUser,
    cluster_id: Annotated[str, Query(min_length=1)],
    namespace: Annotated[str | None, Query()] = None,
) -> ClusterMap:
    check(user, "read", cluster_id, namespace or None)
    try:
        api = registry.api_client(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return await cluster_map(api, Scope(cluster_id=cluster_id, namespace=namespace or None))
