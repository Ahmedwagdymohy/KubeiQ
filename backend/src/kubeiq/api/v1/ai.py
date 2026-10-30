"""AI beyond Cluster Doctor: log analysis and the cluster assistant (docs/requirements/07).

Everything reads through the user's access: tools only reach the namespaces their projects
allow, questions and evidence are redacted, and nothing the model says can change the cluster.
"""

import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable, Coroutine
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from kubeiq.agent import chat
from kubeiq.agent.agent import AgentFailedError
from kubeiq.agent.llm import LLMClient, LLMError, get_llm
from kubeiq.agent.log_analysis import AnalyzedLogs, analyze
from kubeiq.agent.prompts import ASSISTANT_SYSTEM_PROMPT, build_assistant_context
from kubeiq.agent.scoped import ASSISTANT_TOOL_SPECS, ScopedTools
from kubeiq.agent.tools import AgentTools
from kubeiq.auth.deps import CurrentUser, Principal, check
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.core.config import get_settings
from kubeiq.db.models import DEFAULT_ORG, AssistantConversation, AssistantMessage
from kubeiq.db.session import get_session, get_sessionmaker
from kubeiq.security.redaction import redact
from kubeiq.settings.service import effective_settings

router = APIRouter(prefix="/ai", tags=["ai"])

Session = Annotated[AsyncSession, Depends(get_session)]
Registry = Annotated[ClusterRegistry, Depends(get_registry)]
MAX_CONVERSATIONS = 200


class AIStatus(BaseModel):
    enabled: bool


async def _llm(session: AsyncSession) -> tuple[LLMClient, int]:
    settings = await effective_settings(session, get_settings())
    llm = get_llm(settings)
    if llm is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect an AI model in Settings first")
    return llm, settings.agent_max_steps


def _see(user: Principal, cluster_id: str) -> set[str] | None:
    """The namespaces the user may read in the cluster (None: all); 403 when none."""
    clusters = user.access.clusters()
    if not user.is_admin and clusters is not None and cluster_id not in clusters:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your projects do not include this cluster")
    return user.access.namespaces(cluster_id)


def _tools(registry: ClusterRegistry, cluster_id: str, namespaces: set[str] | None) -> ScopedTools:
    try:
        return ScopedTools(AgentTools(registry.api_client(cluster_id)), namespaces)
    except ClusterNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


def _stream(
    run: Callable[[Callable[[str], Awaitable[None]]], Coroutine[Any, Any, str]],
    done: Callable[[str, list[str]], Awaitable[Any]],
) -> AsyncIterator[dict[str, Any]]:
    """SSE: a `step` per tool call, then what ``done`` returns as `messages`, or an `error`."""

    async def events() -> AsyncIterator[dict[str, Any]]:
        steps: asyncio.Queue[str | None] = asyncio.Queue()
        seen: list[str] = []

        async def on_step(detail: str) -> None:
            seen.append(detail)
            await steps.put(detail)

        task: asyncio.Task[str] = asyncio.create_task(run(on_step))
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
                logger.exception("AI answer failed")
                yield {"event": "error", "data": json.dumps({"detail": "Something went wrong"})}
                return
            yield {"event": "messages", "data": json.dumps(await done(reply, seen), default=str)}
        finally:
            task.cancel()

    return events()


@router.get("/status", response_model=AIStatus)
async def ai_status(session: Session) -> AIStatus:
    """Whether an AI model is connected, for everyone (the model settings are admin-only)."""
    settings = await effective_settings(session, get_settings())
    return AIStatus(enabled=bool(settings.llm_model))


# ---------- Log analysis ----------


class AnalyzeIn(BaseModel):
    cluster_id: str
    namespace: str
    pod: str
    container: str | None = None
    previous: bool = False


@router.post("/logs/analyze", response_model=AnalyzedLogs)
async def analyze_logs(
    body: AnalyzeIn, session: Session, registry: Registry, user: CurrentUser
) -> AnalyzedLogs:
    check(user, "read", body.cluster_id, body.namespace)
    llm, _ = await _llm(session)
    try:
        api = registry.api_client(body.cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    try:
        return await analyze(api, body.namespace, body.pod, body.container, body.previous, llm)
    except (LLMError, AgentFailedError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "The AI reply was not usable. Try again"
        ) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, describe_error(exc)) from exc


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class LogQuestionIn(AnalyzeIn):
    analysis: dict[str, Any]
    history: list[Turn] = Field(default_factory=list, max_length=20)
    message: str = Field(min_length=1, max_length=2000)


@router.post("/logs/ask")
async def ask_about_logs(
    body: LogQuestionIn, session: Session, registry: Registry, user: CurrentUser
) -> EventSourceResponse:
    """A follow-up question on a log analysis, with the same read-only tools as the assistant."""
    check(user, "read", body.cluster_id, body.namespace)
    llm, max_steps = await _llm(session)
    namespaces = _see(user, body.cluster_id)
    tools = _tools(registry, body.cluster_id, namespaces)
    extra = (
        f"The engineer is looking at the logs of pod {body.namespace}/{body.pod}"
        f" (container {body.container or 'default'}). The analysis so far:\n"
        + redact(json.dumps(body.analysis, default=str)[:6000])
    )
    context = build_assistant_context(
        body.cluster_id, None if namespaces is None else sorted(namespaces), extra
    )
    history = [{"role": t.role, "content": redact(t.content)} for t in body.history]
    question = redact(body.message.strip())

    async def run(on_step: Callable[[str], Awaitable[None]]) -> str:
        return await chat.converse(
            ASSISTANT_SYSTEM_PROMPT,
            context,
            history,
            question,
            llm,
            tools,
            ASSISTANT_TOOL_SPECS,
            max_steps,
            on_step,
        )

    async def done(reply: str, steps: list[str]) -> dict[str, Any]:
        return {"answer": reply, "steps": steps}

    return EventSourceResponse(_stream(run, done), ping=15)


# ---------- The cluster assistant ----------


class ConversationOut(BaseModel):
    id: str
    cluster_id: str
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    steps: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]


class ConversationIn(BaseModel):
    cluster_id: str = Field(min_length=1, max_length=512)


class RenameIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class AskIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


async def _own(
    session: AsyncSession, user: Principal, conversation_id: str
) -> AssistantConversation:
    row = await session.get(AssistantConversation, conversation_id)
    if row is None or row.user_id != user.user_id or row.org_id != DEFAULT_ORG:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return row


async def _messages(session: AsyncSession, conversation_id: str) -> list[AssistantMessage]:
    rows = await session.execute(
        select(AssistantMessage)
        .where(AssistantMessage.conversation_id == conversation_id)
        .order_by(AssistantMessage.id)
    )
    return list(rows.scalars())


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    session: Session, user: CurrentUser, cluster_id: Annotated[str | None, Query()] = None
) -> list[AssistantConversation]:
    query = select(AssistantConversation).where(
        AssistantConversation.org_id == DEFAULT_ORG, AssistantConversation.user_id == user.user_id
    )
    if cluster_id:
        query = query.where(AssistantConversation.cluster_id == cluster_id)
    rows = await session.execute(query.order_by(AssistantConversation.updated_at.desc()).limit(100))
    return list(rows.scalars())


@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationIn, session: Session, user: CurrentUser
) -> AssistantConversation:
    _see(user, body.cluster_id)
    count = await session.execute(
        select(AssistantConversation.id).where(AssistantConversation.user_id == user.user_id)
    )
    if len(count.all()) >= MAX_CONVERSATIONS:
        raise HTTPException(status.HTTP_409_CONFLICT, "Delete some conversations first")
    row = AssistantConversation(
        user_id=user.user_id, cluster_id=body.cluster_id, title="New conversation"
    )
    session.add(row)
    await session.commit()
    return row


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str, session: Session, user: CurrentUser
) -> ConversationDetail:
    row = await _own(session, user, conversation_id)
    messages = [MessageOut.model_validate(m) for m in await _messages(session, row.id)]
    return ConversationDetail(**ConversationOut.model_validate(row).model_dump(), messages=messages)


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
async def rename_conversation(
    conversation_id: str, body: RenameIn, session: Session, user: CurrentUser
) -> AssistantConversation:
    row = await _own(session, user, conversation_id)
    row.title = body.title.strip()
    await session.commit()
    return row


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: str, session: Session, user: CurrentUser) -> None:
    row = await _own(session, user, conversation_id)
    await session.execute(
        delete(AssistantMessage).where(AssistantMessage.conversation_id == row.id)
    )
    await session.delete(row)
    await session.commit()


@router.post("/conversations/{conversation_id}/ask")
async def ask_assistant(
    conversation_id: str, body: AskIn, session: Session, registry: Registry, user: CurrentUser
) -> EventSourceResponse:
    """Ask about the conversation's cluster. Streams `step` events while the assistant looks,
    then `messages` (the stored question and answer) or `error`."""
    row = await _own(session, user, conversation_id)
    namespaces = _see(user, row.cluster_id)
    llm, max_steps = await _llm(session)
    tools = _tools(registry, row.cluster_id, namespaces)
    history = [{"role": m.role, "content": m.content} for m in await _messages(session, row.id)]
    context = build_assistant_context(
        row.cluster_id, None if namespaces is None else sorted(namespaces)
    )
    question = redact(body.message.strip())
    first = not history

    async def run(on_step: Callable[[str], Awaitable[None]]) -> str:
        return await chat.converse(
            ASSISTANT_SYSTEM_PROMPT,
            context,
            history,
            question,
            llm,
            tools,
            ASSISTANT_TOOL_SPECS,
            max_steps,
            on_step,
        )

    async def done(reply: str, steps: list[str]) -> list[dict[str, Any]]:
        async with get_sessionmaker()() as store:
            convo = await store.get(AssistantConversation, conversation_id)
            asked = AssistantMessage(
                conversation_id=conversation_id, role="user", content=question, steps=[]
            )
            answered = AssistantMessage(
                conversation_id=conversation_id, role="assistant", content=reply, steps=steps
            )
            store.add_all([asked, answered])
            if convo is not None:
                convo.updated_at = datetime.now(UTC)
                if first:
                    convo.title = question[:80] + ("…" if len(question) > 80 else "")
            await store.commit()
            return [MessageOut.model_validate(m).model_dump(mode="json") for m in (asked, answered)]

    return EventSourceResponse(_stream(run, done), ping=15)


@router.get("/suggestions", response_model=list[str])
async def suggestions(
    registry: Registry, user: CurrentUser, cluster_id: Annotated[str, Query(min_length=1)]
) -> list[str]:
    """Starting points from the cluster's current problems, then general questions."""
    namespaces = _see(user, cluster_id)
    tools = _tools(registry, cluster_id, namespaces)
    picks: list[str] = []
    try:
        problems = await asyncio.wait_for(asyncio.to_thread(tools.find_problem_pods), 8)
    except Exception:
        problems = []
    seen: set[str] = set()
    for p in problems:
        namespace, name = p["pod"].split("/", 1)
        workload = name.rsplit("-", 2)[0] if name.count("-") >= 2 else name
        if workload in seen or p["ready"]:
            continue
        seen.add(workload)
        picks.append(f"Why is {workload} in {namespace} failing?")
        if len(picks) == 3:
            break
    return [
        *picks,
        "Which pods restarted in the last hour?",
        "What changed in the cluster recently?",
        "Is anything close to running out of CPU or memory?",
    ][:5]
