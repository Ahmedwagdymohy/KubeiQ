"""Typed evidence produced by collectors and consumed by detectors.

Every item carries a ``ref`` like ``Pod/default/payment-7f9`` so findings can point back to it.
"""

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


def make_ref(kind: str, namespace: str | None, name: str) -> str:
    return f"{kind}/{namespace}/{name}" if namespace else f"{kind}/{name}"


class Scope(BaseModel):
    cluster_id: str
    namespace: str | None = None  # None = all namespaces


class EnvSource(StrEnum):
    VALUE = "value"
    SECRET = "secret"  # noqa: S105 - enum label, not a credential
    CONFIG_MAP = "configMap"
    FIELD = "field"
    RESOURCE = "resource"


class EnvVar(BaseModel):
    name: str
    source: EnvSource
    value: str | None = None  # literal values only, already redacted
    ref: str | None = None  # e.g. "db-credentials/password" for secret/configMap refs
    optional: bool = False


class ContainerSnapshot(BaseModel):
    name: str
    image: str
    init: bool = False
    ready: bool = False
    restart_count: int = 0
    state: Literal["running", "waiting", "terminated", "unknown"] = "unknown"
    reason: str | None = None
    message: str | None = None
    exit_code: int | None = None
    last_reason: str | None = None
    last_exit_code: int | None = None
    last_finished_at: datetime | None = None
    requests: dict[str, str] = Field(default_factory=dict)
    limits: dict[str, str] = Field(default_factory=dict)
    env: list[EnvVar] = Field(default_factory=list)
    env_from: list[str] = Field(default_factory=list)  # e.g. "secret/app-env"
    liveness_probe: str | None = None
    readiness_probe: str | None = None


class Condition(BaseModel):
    type: str
    status: str
    reason: str | None = None
    message: str | None = None


class PodSnapshot(BaseModel):
    ref: str
    name: str
    namespace: str
    phase: str
    node: str | None = None
    owner: str | None = None  # e.g. "ReplicaSet/payment-7f9c"
    labels: dict[str, str] = Field(default_factory=dict)
    conditions: list[Condition] = Field(default_factory=list)
    containers: list[ContainerSnapshot] = Field(default_factory=list)
    reason: str | None = None
    message: str | None = None
    created_at: datetime | None = None
    unhealthy: bool = False


class EventRecord(BaseModel):
    ref: str
    type: str
    reason: str
    message: str
    involved: str
    count: int = 1
    first_seen: datetime | None = None
    last_seen: datetime | None = None


class WorkloadSnapshot(BaseModel):
    ref: str
    kind: Literal["Deployment", "StatefulSet", "DaemonSet"]
    name: str
    namespace: str
    desired: int
    ready: int
    available: int
    updated: int
    selector: dict[str, str] = Field(default_factory=dict)
    conditions: list[Condition] = Field(default_factory=list)


class ServiceSnapshot(BaseModel):
    ref: str
    name: str
    namespace: str
    type: str
    selector: dict[str, str] = Field(default_factory=dict)
    ports: list[str] = Field(default_factory=list)
    ready_endpoints: int = 0
    not_ready_endpoints: int = 0


class NodeSnapshot(BaseModel):
    ref: str
    name: str
    ready: bool
    unschedulable: bool = False
    pressure: list[str] = Field(default_factory=list)  # e.g. ["MemoryPressure"]
    taints: list[str] = Field(default_factory=list)
    allocatable: dict[str, str] = Field(default_factory=dict)


class LogExcerpt(BaseModel):
    ref: str  # Pod ref + "/" + container
    pod: str
    container: str
    previous: bool
    lines: list[str] = Field(default_factory=list)
    truncated: bool = False
    error: str | None = None


class Gap(BaseModel):
    collector: str
    error: str


class EvidenceBundle(BaseModel):
    scope: Scope
    collected_at: datetime
    pods: list[PodSnapshot] = Field(default_factory=list)
    events: list[EventRecord] = Field(default_factory=list)
    workloads: list[WorkloadSnapshot] = Field(default_factory=list)
    services: list[ServiceSnapshot] = Field(default_factory=list)
    nodes: list[NodeSnapshot] = Field(default_factory=list)
    logs: list[LogExcerpt] = Field(default_factory=list)
    gaps: list[Gap] = Field(default_factory=list)

    @property
    def unhealthy_pods(self) -> list[PodSnapshot]:
        return [p for p in self.pods if p.unhealthy]


class ProgressEvent(BaseModel):
    step: str
    status: Literal["started", "completed", "failed"]
    detail: str | None = None
