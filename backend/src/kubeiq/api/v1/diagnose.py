"""Synchronous diagnosis endpoint. Async investigations with live progress come in Phase 4."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.agent.diagnosis import DiagnosisReport
from kubeiq.agent.llm import get_llm
from kubeiq.agent.service import diagnose
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.collectors.models import Scope
from kubeiq.core.config import Settings, get_settings
from kubeiq.db.session import get_session
from kubeiq.settings.service import effective_settings

router = APIRouter(prefix="/diagnose", tags=["diagnose"])


@router.post("", response_model=DiagnosisReport)
async def run_diagnosis(
    scope: Scope,
    registry: Annotated[ClusterRegistry, Depends(get_registry)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DiagnosisReport:
    settings = await effective_settings(session, settings)
    try:
        api = registry.api_client(scope.cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return await diagnose(api, scope, settings, get_llm(settings))
