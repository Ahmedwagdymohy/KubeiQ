"""Insights API: timeline and pod distribution, within the user's access."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth.deps import CurrentUser, check
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.db.session import get_session
from kubeiq.products.insights import distribution, timeline

router = APIRouter(prefix="/insights", tags=["insights"])

Registry = Annotated[ClusterRegistry, Depends(get_registry)]
ClusterId = Annotated[str, Query(min_length=1)]


@router.get("/timeline", response_model=list[timeline.TimelineItem])
async def get_timeline(
    registry: Registry,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    cluster_id: ClusterId,
    namespace: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[timeline.TimelineItem]:
    if namespace:
        check(user, "read", cluster_id, namespace)
        scope: list[str] | None = [namespace]
    else:
        clusters = user.access.clusters()
        if not user.is_admin and clusters is not None and cluster_id not in clusters:
            raise HTTPException(status_code=403, detail="Your projects do not include this cluster")
        allowed = user.access.namespaces(cluster_id)
        scope = None if allowed is None else sorted(allowed)
    try:
        api = registry.api_client(cluster_id)
        events = await asyncio.to_thread(timeline.kubernetes_events, api, scope)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=describe_error(exc)) from exc
    own = await timeline.kubeiq_entries(session, cluster_id, scope)
    return timeline.merge(events, own, limit=limit)


@router.get("/distribution", response_model=distribution.Distribution)
async def get_distribution(
    registry: Registry, user: CurrentUser, cluster_id: ClusterId, namespace: str | None = None
) -> distribution.Distribution:
    """Nodes are cluster-wide: this needs access to the whole cluster."""
    check(user, "read", cluster_id, None)
    try:
        api = registry.api_client(cluster_id)
        return await asyncio.to_thread(distribution.analyze, api, namespace or None)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=describe_error(exc)) from exc
