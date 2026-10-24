"""Liveness and readiness probes."""

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import text

from kubeiq import __version__
from kubeiq.db.session import get_sessionmaker

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
    """Ready once the database answers."""
    try:
        async with get_sessionmaker()() as session:
            await session.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("Database not ready: {}", exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return HealthResponse(status="ready")
