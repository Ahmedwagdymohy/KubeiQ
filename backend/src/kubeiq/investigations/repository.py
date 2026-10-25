"""Database access for investigations."""

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kubeiq.agent.diagnosis import DiagnosisReport
from kubeiq.db.models import (
    DEFAULT_ORG,
    IncidentMessage,
    Investigation,
    InvestigationEvent,
    InvestigationStatus,
)
from kubeiq.detectors.models import Severity

_SEVERITY_ORDER = [Severity.CRITICAL, Severity.WARNING, Severity.INFO]


async def create(
    session: AsyncSession, cluster_id: str, namespace: str | None, org_id: str = DEFAULT_ORG
) -> Investigation:
    investigation = Investigation(cluster_id=cluster_id, namespace=namespace, org_id=org_id)
    session.add(investigation)
    await session.commit()
    return investigation


async def get(
    session: AsyncSession,
    investigation_id: str,
    org_id: str = DEFAULT_ORG,
    with_events: bool = False,
) -> Investigation | None:
    query = select(Investigation).where(
        Investigation.id == investigation_id, Investigation.org_id == org_id
    )
    if with_events:
        query = query.options(selectinload(Investigation.events))
    return (await session.execute(query)).scalar_one_or_none()


async def list_recent(
    session: AsyncSession,
    org_id: str = DEFAULT_ORG,
    cluster_id: str | None = None,
    limit: int = 20,
    before: datetime | None = None,
) -> list[Investigation]:
    query = select(Investigation).where(Investigation.org_id == org_id)
    if cluster_id:
        query = query.where(Investigation.cluster_id == cluster_id)
    if before:
        query = query.where(Investigation.created_at < before)
    query = query.order_by(Investigation.created_at.desc()).limit(limit)
    return list((await session.execute(query)).scalars())


async def add_event(
    session: AsyncSession,
    investigation_id: str,
    seq: int,
    step: str,
    status: str,
    detail: str | None,
) -> InvestigationEvent:
    """Store a progress event. ``seq`` is assigned by the runner so concurrent events
    from parallel agents never collide."""
    event = InvestigationEvent(
        investigation_id=investigation_id,
        seq=seq,
        step=step,
        status=status,
        detail=detail,
    )
    session.add(event)
    await session.commit()
    return event


async def mark_running(
    session: AsyncSession, investigation: Investigation, model: str | None
) -> None:
    investigation.status = InvestigationStatus.RUNNING
    investigation.started_at = datetime.now(UTC)
    investigation.llm_model = model
    await session.commit()


async def mark_completed(
    session: AsyncSession, investigation: Investigation, report: DiagnosisReport
) -> None:
    investigation.status = InvestigationStatus.COMPLETED
    investigation.finished_at = datetime.now(UTC)
    investigation.healthy = report.healthy
    investigation.incident_count = len(report.diagnoses)
    investigation.report = report.model_dump(mode="json")
    if report.diagnoses:
        top = min(report.diagnoses, key=lambda d: _SEVERITY_ORDER.index(d.severity))
        investigation.summary = f"{top.workload.split('/')[-1]}: {top.root_cause}"[:500]
        investigation.severity = top.severity
    await session.commit()


async def mark_failed(session: AsyncSession, investigation: Investigation, error: str) -> None:
    investigation.status = InvestigationStatus.FAILED
    investigation.finished_at = datetime.now(UTC)
    investigation.error = error
    await session.commit()


async def fail_interrupted(session: AsyncSession) -> int:
    """Investigations left running by a previous process can never finish; mark them failed."""
    result = await session.execute(
        update(Investigation)
        .where(Investigation.status.in_([InvestigationStatus.QUEUED, InvestigationStatus.RUNNING]))
        .values(
            status=InvestigationStatus.FAILED,
            finished_at=datetime.now(UTC),
            error="Interrupted by a server restart",
        )
    )
    await session.commit()
    return int(getattr(result, "rowcount", 0) or 0)


async def list_messages(
    session: AsyncSession, investigation_id: str, incident_id: str, org_id: str = DEFAULT_ORG
) -> list[IncidentMessage]:
    query = (
        select(IncidentMessage)
        .where(
            IncidentMessage.org_id == org_id,
            IncidentMessage.investigation_id == investigation_id,
            IncidentMessage.incident_id == incident_id,
        )
        .order_by(IncidentMessage.id)
    )
    return list((await session.execute(query)).scalars())


async def add_exchange(
    session: AsyncSession,
    investigation_id: str,
    incident_id: str,
    author: str,
    question: str,
    reply: str,
    org_id: str = DEFAULT_ORG,
) -> list[IncidentMessage]:
    """Store a question with its answer together, so a thread never holds an unanswered one."""
    rows = [
        IncidentMessage(
            org_id=org_id,
            investigation_id=investigation_id,
            incident_id=incident_id,
            role=role,
            author=who,
            content=content,
        )
        for role, who, content in (("user", author, question), ("assistant", None, reply))
    ]
    session.add_all(rows)
    await session.commit()
    return rows
