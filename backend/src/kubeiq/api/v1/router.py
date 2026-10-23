"""Versioned API router. Feature routers are included here.

Everything except sign-in needs a signed-in user (session cookie or ``Bearer <master key>``).
"""

from fastapi import APIRouter, Depends

from kubeiq.api.v1 import (
    auth,
    clusters,
    diagnose,
    evidence,
    investigations,
    projects,
    settings,
    users,
)
from kubeiq.auth.deps import current_principal
from kubeiq.products.map import api as map_api

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)

protected = APIRouter(dependencies=[Depends(current_principal)])
protected.include_router(clusters.router)
protected.include_router(evidence.router)
protected.include_router(diagnose.router)
protected.include_router(investigations.router)
protected.include_router(settings.router)
protected.include_router(users.router)
protected.include_router(projects.router)
protected.include_router(map_api.router)
router.include_router(protected)
