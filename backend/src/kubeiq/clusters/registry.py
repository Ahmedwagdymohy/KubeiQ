"""Single entry point that aggregates all cluster sources."""

import asyncio
from functools import lru_cache

from kubernetes.client import ApiClient, VersionApi
from loguru import logger

from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterSource, ClusterStatus
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.kubeconfig import KubeconfigSource
from kubeiq.clusters.uploaded import UploadedKubeconfigSource
from kubeiq.core.config import get_settings

PROBE_TIMEOUT_SECONDS = 3


class ClusterRegistry:
    def __init__(self, sources: list[ClusterSource]) -> None:
        self._sources = sources

    def list_clusters(self) -> list[ClusterInfo]:
        clusters: list[ClusterInfo] = []
        for source in self._sources:
            # One broken source (an unreadable file) must not hide the clusters of the others.
            try:
                clusters.extend(source.list_clusters())
            except Exception:
                logger.exception("Could not list clusters from {}", type(source).__name__)
        return clusters

    def get_cluster(self, cluster_id: str) -> ClusterInfo:
        for cluster in self.list_clusters():
            if cluster.id == cluster_id:
                return cluster
        raise ClusterNotFoundError(cluster_id)

    def api_client(self, cluster_id: str) -> ApiClient:
        for source in self._sources:
            if cluster_id.startswith(f"{source.method.value}:"):
                return source.api_client(cluster_id)
        raise ClusterNotFoundError(cluster_id)

    async def check(self, cluster_id: str) -> ClusterStatus:
        """Probe the API server version without blocking the event loop."""
        try:
            client = self.api_client(cluster_id)
            info = await asyncio.to_thread(
                VersionApi(client).get_code, _request_timeout=PROBE_TIMEOUT_SECONDS
            )
            return ClusterStatus(reachable=True, version=info.git_version)
        except ClusterNotFoundError:
            raise
        except Exception as exc:
            logger.debug("Probe failed for {}: {}", cluster_id, exc)
            return ClusterStatus(reachable=False, error=describe_error(exc))


@lru_cache
def get_local_source() -> KubeconfigSource:
    settings = get_settings()
    return KubeconfigSource(settings.kubeconfig, settings.kubeconfig_localhost_alias)


@lru_cache
def get_uploaded_source() -> UploadedKubeconfigSource:
    return UploadedKubeconfigSource(get_settings().kubeconfig_localhost_alias)


@lru_cache
def get_registry() -> ClusterRegistry:
    return ClusterRegistry([get_local_source(), get_uploaded_source()])
