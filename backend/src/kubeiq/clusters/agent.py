"""Cluster source for clusters connected through the KubeiQ Agent (ADR 0017).

The ``ApiClient`` it hands out talks plain HTTP to KubeiQ's local agent gateway, which forwards
each connection through the cluster's agent tunnel. Nothing else in KubeiQ needs to know.
KubeiQ holds no credentials for these clusters: the agent adds its own ServiceAccount token.
"""

import threading
from typing import Any

from kubernetes.client import ApiClient, Configuration

from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterSource, ConnectionMethod
from kubeiq.tunnel.hub import AgentHub


class AgentSource(ClusterSource):
    method = ConnectionMethod.AGENT

    def __init__(self, hub: AgentHub) -> None:
        self._hub = hub
        self._lock = threading.Lock()
        self._entries: dict[str, dict[str, Any]] = {}
        self._clients: dict[str, ApiClient] = {}

    def set_entries(self, entries: list[dict[str, Any]]) -> None:
        """Entries as stored: name, plus status fields the Settings page shows."""
        with self._lock:
            self._entries = {e["name"]: e for e in entries}
            for name in list(self._clients):
                if name not in self._entries:
                    self._clients.pop(name)
                    self._hub.forget(name)

    def list_clusters(self) -> list[ClusterInfo]:
        return [
            ClusterInfo(id=self.make_id(name), name=name, method=self.method)
            for name in self._entries
        ]

    def api_client(self, cluster_id: str) -> ApiClient:
        name = cluster_id.removeprefix(f"{self.method.value}:")
        if name not in self._entries:
            raise ClusterNotFoundError(cluster_id)
        with self._lock:
            if name not in self._clients:
                configuration = Configuration()
                configuration.host = self._hub.url
                configuration.api_key = {"authorization": self._hub.secret(name)}
                configuration.api_key_prefix = {"authorization": "Bearer"}
                self._clients[name] = ApiClient(configuration)
            return self._clients[name]
