"""Investigations: start in the background, stream progress over SSE, browse history."""

import json
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from kubeiq.auth.deps import CurrentUser, Principal, check
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.db.models import Investigation, InvestigationStatus
from kubeiq.db.session import get_session, get_sessionmaker
from kubeiq.investigations import repository
from kubeiq.investigations.broker import EventBroker
from kubeiq.investigations.models import (
    EventOut,
    InvestigationDetail,
    InvestigationRequest,
    InvestigationSummary,
)
from kubeiq.investigations.runner import InvestigationRunner, get_broker, get_runner

router = APIRouter(prefix="/investigations", tags=["investigations"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("", response_model=InvestigationSummary, status_code=status.HTTP_202_ACCEPTED)
async def start_investigation(
    request: InvestigationRequest,
    session: Session,
    registry: Annotated[ClusterRegistry, Depends(get_registry)],
    runner: Annotated[InvestigationRunner, Depends(get_runner)],
    user: CurrentUser,
) -> InvestigationSummary:
    check(user, "read", request.cluster_id, request.namespace)
    try:
        registry.get_cluster(request.cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    investigation = await repository.create(session, request.cluster_id, request.namespace)
    runner.start(investigation)
    return InvestigationSummary.model_validate(investigation)


@router.get("", response_model=list[InvestigationSummary])
async def list_investigations(
    session: Session,
    user: CurrentUser,
    cluster_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[InvestigationSummary]:
    # Over-fetch for non-admins so filtering by project still fills the page.
    fetch = limit if user.is_admin else limit * 5
    rows = await repository.list_recent(session, cluster_id=cluster_id, limit=fetch)
    visible = [r for r in rows if user.access.can("read", r.cluster_id, r.namespace)]
    return [InvestigationSummary.model_validate(row) for row in visible[:limit]]


@router.get("/{investigation_id}", response_model=InvestigationDetail)
async def get_investigation(
    investigation_id: str, session: Session, user: CurrentUser
) -> InvestigationDetail:
    investigation = await repository.get(session, investigation_id, with_events=True)
    if investigation is None or not _visible(user, investigation):
        raise HTTPException(status_code=404, detail="Investigation not found")
    return InvestigationDetail.model_validate(investigation)


@router.get("/{investigation_id}/events")
async def stream_events(
    investigation_id: str,
    request: Request,
    broker: Annotated[EventBroker, Depends(get_broker)],
    user: CurrentUser,
) -> EventSourceResponse:
    """Server-Sent Events: replays stored progress, then streams live until the run finishes."""
    async with get_sessionmaker()() as session:
        investigation = await repository.get(session, investigation_id)
        if investigation is None or not _visible(user, investigation):
            raise HTTPException(status_code=404, detail="Investigation not found")
    return EventSourceResponse(_events(investigation_id, request, broker), ping=15)


def _visible(user: Principal, investigation: Investigation) -> bool:
    return user.access.can("read", investigation.cluster_id, investigation.namespace)


def _message(event: EventOut) -> dict[str, Any]:
    return {"event": "progress", "id": str(event.seq), "data": event.model_dump_json()}


async def _events(
    investigation_id: str, request: Request, broker: EventBroker
) -> AsyncIterator[dict[str, Any]]:
    # Subscribe before replaying so no event can slip between the replay and the live stream.
    async with broker.subscribe(investigation_id) as queue:
        async with get_sessionmaker()() as session:
            investigation = await repository.get(session, investigation_id, with_events=True)
        assert investigation is not None  # noqa: S101 - checked by the endpoint
        # Parallel steps can publish slightly out of order, so dedupe by exact seq, not max.
        sent: set[int] = set()
        for stored in investigation.events:
            event = EventOut.model_validate(stored)
            sent.add(event.seq)
            yield _message(event)

        if not InvestigationStatus(investigation.status).finished:
            while not await request.is_disconnected():
                live = await queue.get()
                if live is None:
                    break
                if live.seq not in sent:
                    sent.add(live.seq)
                    yield _message(live)

    async with get_sessionmaker()() as session:
        final = await repository.get(session, investigation_id)
    yield {"event": "end", "data": json.dumps({"status": final.status if final else "unknown"})}
