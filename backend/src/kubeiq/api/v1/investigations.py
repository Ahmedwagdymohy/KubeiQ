"""Investigations: start in the background, stream progress over SSE, browse history, and ask
follow-up questions on an incident."""

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from kubeiq.agent import chat
from kubeiq.agent.agent import AgentFailedError
from kubeiq.agent.diagnosis import Diagnosis, DiagnosisReport
from kubeiq.agent.llm import LLMClient, LLMError, get_llm
from kubeiq.agent.tools import AgentTools
from kubeiq.auth.deps import CurrentUser, Principal, check
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.core.config import get_settings
from kubeiq.db.models import Investigation, InvestigationStatus
from kubeiq.db.session import get_session, get_sessionmaker
from kubeiq.investigations import repository
from kubeiq.investigations.broker import EventBroker
from kubeiq.investigations.models import (
    ChatMessageOut,
    ChatQuestion,
    ChatThread,
    EventOut,
    InvestigationDetail,
    InvestigationRequest,
    InvestigationSummary,
)
from kubeiq.investigations.runner import InvestigationRunner, get_broker, get_runner
from kubeiq.security.redaction import redact
from kubeiq.settings.service import effective_settings

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
    before: datetime | None = None,
) -> list[InvestigationSummary]:
    """Newest first. Pass the last item's created_at as `before` to load the next page."""
    # Over-fetch for non-admins so filtering by project still fills the page.
    fetch = limit if user.is_admin else limit * 5
    rows = await repository.list_recent(session, cluster_id=cluster_id, limit=fetch, before=before)
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


@router.get("/{investigation_id}/chat", response_model=ChatThread)
async def get_chat(
    investigation_id: str, incident_id: str, session: Session, user: CurrentUser
) -> ChatThread:
    """The follow-up questions and answers on one incident, oldest first."""
    investigation = await _readable(session, user, investigation_id)
    _diagnosis(investigation, incident_id)
    settings = await effective_settings(session, get_settings())
    rows = await repository.list_messages(session, investigation_id, incident_id)
    return ChatThread(
        ai_enabled=bool(settings.llm_model),
        messages=[ChatMessageOut.model_validate(row) for row in rows],
    )


@router.post("/{investigation_id}/chat")
async def ask(
    investigation_id: str,
    question: ChatQuestion,
    session: Session,
    registry: Annotated[ClusterRegistry, Depends(get_registry)],
    user: CurrentUser,
) -> EventSourceResponse:
    """Ask about an incident. Streams `step` events while the AI checks the cluster, then
    `messages` (the stored question and answer) or `error`."""
    investigation = await _readable(session, user, investigation_id)
    diagnosis = _diagnosis(investigation, question.incident_id)
    settings = await effective_settings(session, get_settings())
    llm = get_llm(settings)
    if llm is None:
        raise HTTPException(status_code=409, detail="Connect an AI model in Settings first")
    try:
        tools: AgentTools | None = AgentTools(registry.api_client(investigation.cluster_id))
    except Exception:  # cluster gone or unreachable: answer from the diagnosis alone
        tools = None
    history = [
        {"role": row.role, "content": row.content}
        for row in await repository.list_messages(session, investigation_id, question.incident_id)
    ]
    run = _Ask(investigation, diagnosis, history, redact(question.message.strip()), user.username)
    return EventSourceResponse(run.stream(llm, tools, settings.agent_max_steps), ping=15)


class _Ask:
    def __init__(
        self,
        investigation: Investigation,
        diagnosis: Diagnosis,
        history: list[dict[str, str]],
        question: str,
        author: str,
    ) -> None:
        self.investigation_id = investigation.id
        self.cluster_id = investigation.cluster_id
        self.diagnosis = diagnosis
        self.history = history
        self.question = question
        self.author = author

    async def stream(
        self, llm: LLMClient, tools: AgentTools | None, max_steps: int
    ) -> AsyncIterator[dict[str, Any]]:
        steps: asyncio.Queue[str | None] = asyncio.Queue()

        async def on_step(detail: str) -> None:
            await steps.put(detail)

        task = asyncio.create_task(
            chat.answer(
                self.diagnosis,
                self.cluster_id,
                self.history,
                self.question,
                llm,
                tools,
                max_steps,
                on_step,
            )
        )
        task.add_done_callback(lambda _: steps.put_nowait(None))
        try:
            while (detail := await steps.get()) is not None:
                yield {"event": "step", "data": json.dumps({"detail": detail})}
            try:
                reply = task.result()
            except (LLMError, AgentFailedError) as exc:
                yield {"event": "error", "data": json.dumps({"detail": str(exc)})}
                return
            except Exception:
                logger.exception("Follow-up question failed")
                yield {"event": "error", "data": json.dumps({"detail": "Something went wrong"})}
                return
            async with get_sessionmaker()() as session:
                rows = await repository.add_exchange(
                    session,
                    self.investigation_id,
                    self.diagnosis.incident_id,
                    self.author,
                    self.question,
                    reply,
                )
                data = [ChatMessageOut.model_validate(row).model_dump(mode="json") for row in rows]
            yield {"event": "messages", "data": json.dumps(data)}
        finally:
            task.cancel()


async def _readable(session: AsyncSession, user: Principal, investigation_id: str) -> Investigation:
    investigation = await repository.get(session, investigation_id)
    if investigation is None or not _visible(user, investigation):
        raise HTTPException(status_code=404, detail="Investigation not found")
    return investigation


def _diagnosis(investigation: Investigation, incident_id: str) -> Diagnosis:
    if investigation.report:
        report = DiagnosisReport.model_validate(investigation.report)
        for diagnosis in report.diagnoses:
            if diagnosis.incident_id == incident_id:
                return diagnosis
    raise HTTPException(status_code=404, detail="Incident not found")


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
