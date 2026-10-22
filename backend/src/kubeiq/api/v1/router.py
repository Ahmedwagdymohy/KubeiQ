"""Versioned API router. Feature routers are included here."""

from fastapi import APIRouter

from kubeiq.api.v1 import clusters, diagnose, evidence, investigations
from kubeiq.products.map import api as map_api

router = APIRouter(prefix="/api/v1")
router.include_router(clusters.router)
router.include_router(evidence.router)
router.include_router(diagnose.router)
router.include_router(investigations.router)
router.include_router(map_api.router)
