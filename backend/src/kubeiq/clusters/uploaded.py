"""Cluster source for kubeconfig files added in Settings (one cluster per context).

Contents are decrypted in memory only; nothing is written to disk.
"""

import threading
from typing import Any

from kubernetes import config as k8s_config
from kubernetes.client import ApiClient, Configuration

from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterSource, ConnectionMethod
from kubeiq.clusters.kubeconfig import KubeconfigSource


class UploadedKubeconfigSource(ClusterSource):
    method = ConnectionMethod.UPLOAD

    def __init__(self, localhost_alias: str | None = None) -> None:
        self._localhost_alias = localhost_alias
        self._lock = threading.Lock()
        self._files: dict[str, dict[str, Any]] = {}
        self._clients: dict[str, ApiClient] = {}

    def set_files(self, files: dict[str, dict[str, Any]]) -> None:
        with self._lock:
            self._files = files
            self._clients.clear()

    def list_clusters(self) -> list[ClusterInfo]:
        clusters = []
        for file, config in self._files.items():
            servers = {
                c.get("name"): (c.get("cluster") or {}).get("server")
                for c in config.get("clusters") or []
            }
            for ctx in config.get("contexts") or []:
                spec = ctx.get("context") or {}
                clusters.append(
                    ClusterInfo(
                        id=self.make_id(f"{file}/{ctx['name']}"),
                        name=ctx["name"],
                        method=self.method,
                        server=servers.get(spec.get("cluster")),
                        namespace=spec.get("namespace"),
                    )
                )
        return clusters

    def api_client(self, cluster_id: str) -> ApiClient:
        file, _, context = cluster_id.removeprefix(f"{self.method.value}:").partition("/")
        config = self._files.get(file)
        if not config or not any(c.get("name") == context for c in config.get("contexts") or []):
            raise ClusterNotFoundError(cluster_id)
        with self._lock:
            if cluster_id not in self._clients:
                configuration = Configuration()
                k8s_config.load_kube_config_from_dict(
                    config,
                    context=context,
                    client_configuration=configuration,
                    persist_config=False,
                )
                if self._localhost_alias:
                    KubeconfigSource._apply_localhost_alias(configuration, self._localhost_alias)
                self._clients[cluster_id] = ApiClient(configuration)
            return self._clients[cluster_id]
