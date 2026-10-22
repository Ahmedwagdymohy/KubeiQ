"""Versioned API router. Feature routers are included here."""

from fastapi import APIRouter

from kubeiq.api.v1 import clusters, evidence

router = APIRouter(prefix="/api/v1")
router.include_router(clusters.router)
router.include_router(evidence.router)
