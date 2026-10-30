"""Cluster Manager API models."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class Kind(BaseModel):
    group: str  # "" for the core group
    version: str
    resource: str  # plural, as used in API paths
    kind: str
    label: str  # e.g. "Persistent Volume Claims"
    namespaced: bool
    verbs: list[str]


class Category(BaseModel):
    name: str
    kinds: list[Kind]


class Column(BaseModel):
    name: str
    type: str
    description: str = ""


class Row(BaseModel):
    name: str
    namespace: str | None
    created: str | None
    cells: list[Any]
    # Status details for pods, workloads and nodes (see enrich.py); None for other kinds.
    extra: dict[str, Any] | None = None


class ResourceList(BaseModel):
    columns: list[Column]
    rows: list[Row]
    truncated: bool = False


class ObjectDetail(BaseModel):
    object: dict[str, Any]  # managedFields removed; Secrets come back as metadata only
    yaml: str
    values_hidden: bool = False


class KubeEvent(BaseModel):
    type: str
    reason: str
    message: str
    count: int
    last_seen: str | None
    first_seen: str | None = None
    # The object it is about, for cluster-wide feeds.
    kind: str | None = None
    name: str | None = None
    namespace: str | None = None
    source: str | None = None


class WorkloadPod(BaseModel):
    name: str
    status: str  # waiting reason (CrashLoopBackOff, ...) or phase
    ready: str  # "1/2"
    restarts: int


class SearchHit(BaseModel):
    group: str
    version: str
    resource: str
    kind: str
    namespace: str | None
    name: str


class PodLogs(BaseModel):
    container: str
    containers: list[str]
    lines: list[str]
    truncated: bool


class Action(BaseModel):
    cluster_id: str
    action: Literal["scale", "restart", "delete", "cordon", "uncordon"]
    group: str = ""
    version: str
    resource: str
    namespace: str | None = None
    name: str
    replicas: int | None = Field(default=None, ge=0, le=1000)
    # The cluster's name, typed by the user: required for changes on production clusters.
    confirm: str | None = Field(default=None, max_length=128)


class ActionResult(BaseModel):
    ok: bool
    message: str
