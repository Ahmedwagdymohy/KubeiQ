"""API-facing investigation schemas."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict

from kubeiq.agent.diagnosis import DiagnosisReport


def _as_utc(value: datetime) -> datetime:
    # SQLite returns naive datetimes; everything KubeiQ stores is UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]


class InvestigationRequest(BaseModel):
    cluster_id: str
    namespace: str | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    seq: int
    step: str
    status: str
    detail: str | None = None
    created_at: UtcDatetime


class InvestigationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    cluster_id: str
    namespace: str | None
    status: str
    created_at: UtcDatetime
    started_at: UtcDatetime | None
    finished_at: UtcDatetime | None
    llm_model: str | None
    healthy: bool | None
    incident_count: int
    summary: str | None
    severity: str | None
    error: str | None


class InvestigationDetail(InvestigationSummary):
    report: DiagnosisReport | None = None
    events: list[EventOut] = []
