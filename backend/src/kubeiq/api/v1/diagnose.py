"""Synchronous diagnosis endpoint. Async investigations with live progress come in Phase 4."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from kubeiq.agent.diagnosis import DiagnosisReport
from kubeiq.agent.llm import get_llm
from kubeiq.agent.service import diagnose
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.collectors.models import Scope
from kubeiq.core.config import Settings, get_settings

router = APIRouter(prefix="/diagnose", tags=["diagnose"])


@router.post("", response_model=DiagnosisReport)
async def run_diagnosis(
    scope: Scope,
    registry: Annotated[ClusterRegistry, Depends(get_registry)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DiagnosisReport:
    try:
        api = registry.api_client(scope.cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return await diagnose(api, scope, settings, get_llm(settings))
