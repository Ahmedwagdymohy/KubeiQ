"""Core types for cluster access (ADR 0003).

Everything that needs to talk to a cluster asks a ``ClusterSource`` for an ``ApiClient``.
How the connection is made (kubeconfig, bearer token, in-cluster agent) stays hidden here.
"""

from abc import ABC, abstractmethod
from enum import StrEnum

from kubernetes.client import ApiClient
from pydantic import BaseModel


class ConnectionMethod(StrEnum):
    KUBECONFIG = "kubeconfig"
    UPLOAD = "upload"  # kubeconfig files added in Settings, stored encrypted
    GKE = "gke"  # Google Kubernetes Engine through the machine's Google identity (ADR 0011)
    TOKEN = "token"  # noqa: S105 - planned: ServiceAccount bearer token (Phase 4)
    AGENT = "agent"  # planned: outbound in-cluster agent (Phase 5)


class ClusterInfo(BaseModel):
    id: str
    name: str
    method: ConnectionMethod
    server: str | None = None
    namespace: str | None = None
    is_default: bool = False


class ClusterStatus(BaseModel):
    reachable: bool
    version: str | None = None
    error: str | None = None
    # Reachable, but KubeiQ's identity may not read it (no RBAC binding): investigations would fail.
    can_read: bool | None = None


class ClusterNotFoundError(LookupError):
    def __init__(self, cluster_id: str) -> None:
        super().__init__(f"Cluster '{cluster_id}' not found")
        self.cluster_id = cluster_id


class ClusterSource(ABC):
    method: ConnectionMethod

    @abstractmethod
    def list_clusters(self) -> list[ClusterInfo]:
        """Return the clusters this source knows about. Must not contact the clusters."""

    @abstractmethod
    def api_client(self, cluster_id: str) -> ApiClient:
        """Return a client for the cluster. Raises ``ClusterNotFoundError`` if unknown."""

    def make_id(self, name: str) -> str:
        return f"{self.method.value}:{name}"
