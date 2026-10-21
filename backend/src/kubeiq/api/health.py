"""Liveness and readiness probes."""

from fastapi import APIRouter
from pydantic import BaseModel

from kubeiq import __version__

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str = "kubeiq"
    version: str = __version__


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(status="healthy")


@router.get("/readyz", response_model=HealthResponse)
async def readyz() -> HealthResponse:
    # Extend with dependency checks (database, job queue) as they are introduced.
    return HealthResponse(status="ready")
