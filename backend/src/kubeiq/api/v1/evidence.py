"""Raw evidence collection. Useful for debugging what KubeiQ sees in a cluster."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.collectors.models import EvidenceBundle, Scope
from kubeiq.collectors.runner import collect_evidence

router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.post("", response_model=EvidenceBundle)
async def collect(
    scope: Scope, registry: Annotated[ClusterRegistry, Depends(get_registry)]
) -> EvidenceBundle:
    try:
        api = registry.api_client(scope.cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return await collect_evidence(api, scope)
