"""Cluster Map data model: resources as nodes, relations as edges."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from kubeiq.collectors.models import Gap

Status = Literal["healthy", "warning", "error"]


class Resource(BaseModel):
    """A Kubernetes object reduced to what the map needs. Built from collectors, never Secrets."""

    kind: str
    name: str
    namespace: str | None = None
    owner: str | None = None  # controller as "Kind/name"
    labels: dict[str, str] = Field(default_factory=dict)
    selector: dict[str, str] = Field(default_factory=dict)  # Service / NetworkPolicy selectors
    refs: dict[str, list[str]] = Field(default_factory=dict)  # kind -> names it points at
    facts: dict[str, str] = Field(default_factory=dict)  # short key facts for the details panel
    access_modes: list[str] = Field(default_factory=list)  # PVCs
    status: Status = "healthy"
    reason: str | None = None

    @property
    def ref(self) -> str:
        return "/".join(p for p in (self.kind, self.namespace, self.name) if p)


class MapNode(BaseModel):
    id: str  # resource ref, e.g. "Pod/shop/api-7f9c-abcde"
    kind: str
    name: str
    namespace: str | None = None
    status: Status = "healthy"
    reason: str | None = None  # one-line cause, from detectors when known
    investigate: str | None = None  # workload ref Cluster Doctor should focus on
    facts: dict[str, str] = Field(default_factory=dict)
    labels: dict[str, str] = Field(default_factory=dict)


class MapEdge(BaseModel):
    id: str
    source: str
    target: str
    # Which endpoint may be shared without merging groups (a ReadWriteMany PVC). See Headlamp #4310.
    shared: Literal["source", "target"] | None = None


class ClusterMap(BaseModel):
    cluster_id: str
    namespace: str | None
    collected_at: datetime
    nodes: list[MapNode] = Field(default_factory=list)
    edges: list[MapEdge] = Field(default_factory=list)
    counts: dict[Status, int] = Field(default_factory=dict)
    gaps: list[Gap] = Field(default_factory=list)
