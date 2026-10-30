"""Versioned API router. Feature routers are included here.

Everything except sign-in and connect.sh needs a signed-in user (session cookie or
``Bearer <master key>``). connect.sh hands over a kubeconfig with a one-time code (ADR 0014).
"""

from fastapi import APIRouter, Depends

from kubeiq.api.v1 import (
    auth,
    clusters,
    connect,
    diagnose,
    evidence,
    investigations,
    me,
    projects,
    settings,
    users,
)
from kubeiq.auth.deps import current_principal
from kubeiq.products.manager import api as manager_api
from kubeiq.products.manager import terminal
from kubeiq.products.map import api as map_api

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
# connect.sh and the kubeconfig it hands over: authorized by a one-time code, not a session.
router.include_router(connect.public)
# The terminal is a WebSocket: it checks the session cookie and the page's origin itself.
router.include_router(terminal.router)

protected = APIRouter(dependencies=[Depends(current_principal)])
protected.include_router(clusters.router)
protected.include_router(me.router)
protected.include_router(connect.admin)
protected.include_router(evidence.router)
protected.include_router(diagnose.router)
protected.include_router(investigations.router)
protected.include_router(settings.router)
protected.include_router(users.router)
protected.include_router(projects.router)
protected.include_router(map_api.router)
protected.include_router(manager_api.router)
router.include_router(protected)
