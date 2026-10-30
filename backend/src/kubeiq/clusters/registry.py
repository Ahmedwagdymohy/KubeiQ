"""Single entry point that aggregates all cluster sources."""

import asyncio
from functools import lru_cache

from kubernetes.client import ApiClient, CoreV1Api, VersionApi
from kubernetes.client.exceptions import ApiException
from loguru import logger

from kubeiq.clusters.agent import AgentSource
from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterSource, ClusterStatus
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.gke import GkeSource
from kubeiq.clusters.kubeconfig import KubeconfigSource
from kubeiq.clusters.token import TokenSource
from kubeiq.clusters.uploaded import UploadedKubeconfigSource
from kubeiq.core.config import get_settings
from kubeiq.tunnel.hub import get_hub

PROBE_TIMEOUT_SECONDS = 3
NO_READ_ACCESS = (
    "KubeiQ reaches this cluster but cannot read it. Grant read access with the connect "
    "command under Add Cluster"
)


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
        """Probe the API server version, then whether KubeiQ may read the cluster."""
        login = self.get_cluster(cluster_id).login
        if login:
            # Without the CLI the client sends no credentials at all; say so instead of probing.
            return ClusterStatus(reachable=False, can_read=False, error=needs_login(login))
        server = None
        try:
            client = self.api_client(cluster_id)
            server = client.configuration.host
            info = await asyncio.to_thread(
                VersionApi(client).get_code, _request_timeout=PROBE_TIMEOUT_SECONDS
            )
        except ClusterNotFoundError:
            raise
        except Exception as exc:
            logger.debug("Probe failed for {}: {}", cluster_id, exc)
            return ClusterStatus(reachable=False, error=describe_error(exc, server))
        return await probe_read(client, ClusterStatus(reachable=True, version=info.git_version))


async def test_client(client: ApiClient, wait: float = PROBE_TIMEOUT_SECONDS) -> ClusterStatus:
    """Probe a client that is not registered yet (a connection being added)."""
    try:
        info = await asyncio.to_thread(VersionApi(client).get_code, _request_timeout=wait)
    except Exception as exc:
        return ClusterStatus(reachable=False, error=describe_error(exc, client.configuration.host))
    return await probe_read(client, ClusterStatus(reachable=True, version=info.git_version))


def needs_login(command: str) -> str:
    tool = {"gke-gcloud-auth-plugin": "gcloud", "aws": "aws", "az": "az", "kubelogin": "az"}
    name = tool.get(command, command)
    return (
        f"Logs in through {name}, which KubeiQ cannot use. Fix gives KubeiQ its own read-only "
        "access instead"
    )


async def probe_read(client: ApiClient, status: ClusterStatus) -> ClusterStatus:
    """Any signed-in identity may read the version; listing namespaces needs KubeiQ's role."""
    try:
        await asyncio.to_thread(
            CoreV1Api(client).list_namespace, limit=1, _request_timeout=PROBE_TIMEOUT_SECONDS
        )
    except ApiException as exc:
        if exc.status in (401, 403):
            return status.model_copy(update={"can_read": False, "error": NO_READ_ACCESS})
        return status
    except Exception:
        return status  # slow or flaky: the version answered, so do not call it broken
    return status.model_copy(update={"can_read": True})


@lru_cache
def get_local_source() -> KubeconfigSource:
    settings = get_settings()
    return KubeconfigSource(settings.kubeconfig, settings.kubeconfig_localhost_alias)


@lru_cache
def get_uploaded_source() -> UploadedKubeconfigSource:
    return UploadedKubeconfigSource(get_settings().kubeconfig_localhost_alias)


@lru_cache
def get_gke_source() -> GkeSource:
    return GkeSource()


@lru_cache
def get_token_source() -> TokenSource:
    return TokenSource(get_settings().kubeconfig_localhost_alias)


@lru_cache
def get_agent_source() -> AgentSource:
    return AgentSource(get_hub())


@lru_cache
def get_registry() -> ClusterRegistry:
    return ClusterRegistry(
        [
            get_local_source(),
            get_uploaded_source(),
            get_gke_source(),
            get_token_source(),
            get_agent_source(),
        ]
    )
