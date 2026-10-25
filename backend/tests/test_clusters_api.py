from fastapi.testclient import TestClient
from kubernetes.client import ApiClient

from kubeiq.clusters.base import (
    ClusterInfo,
    ClusterNotFoundError,
    ClusterSource,
    ClusterStatus,
    ConnectionMethod,
)
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.core.config import Settings
from kubeiq.main import create_app
from tests.conftest import AUTH


class FakeSource(ClusterSource):
    method = ConnectionMethod.KUBECONFIG

    def list_clusters(self) -> list[ClusterInfo]:
        return [
            ClusterInfo(id="kubeconfig:up", name="up", method=self.method, is_default=True),
            ClusterInfo(
                id="kubeconfig:arn:aws:eks:x:cluster/down", name="down", method=self.method
            ),
        ]

    def api_client(self, cluster_id: str) -> ApiClient:
        raise ClusterNotFoundError(cluster_id)


class FakeRegistry(ClusterRegistry):
    async def check(self, cluster_id: str) -> ClusterStatus:
        if cluster_id == "kubeconfig:up":
            return ClusterStatus(reachable=True, version="v1.31.0")
        return ClusterStatus(reachable=False, error="Cluster unreachable")


app = create_app(Settings(env="test"))
app.dependency_overrides[get_registry] = lambda: FakeRegistry([FakeSource()])
client = TestClient(app, headers=AUTH)


def test_list_clusters_with_status() -> None:
    body = client.get("/api/v1/clusters", params={"all": True}).json()

    assert [c["name"] for c in body] == ["up", "down"]
    assert body[0]["status"] == {"reachable": True, "version": "v1.31.0", "error": None}
    assert body[1]["status"]["reachable"] is False


def test_list_clusters_without_check() -> None:
    body = client.get("/api/v1/clusters", params={"check": False, "all": True}).json()
    assert all(c["status"] is None for c in body)


def test_get_cluster_with_slashes_in_id() -> None:
    response = client.get("/api/v1/clusters/kubeconfig:arn:aws:eks:x:cluster/down")
    assert response.status_code == 200
    assert response.json()["name"] == "down"


def test_get_unknown_cluster_returns_404() -> None:
    assert client.get("/api/v1/clusters/kubeconfig:missing").status_code == 404


class BrokenSource(FakeSource):
    def list_clusters(self) -> list[ClusterInfo]:
        raise PermissionError(13, "Permission denied")


def test_broken_source_does_not_hide_other_clusters() -> None:
    registry = FakeRegistry([BrokenSource(), FakeSource()])
    assert [c.name for c in registry.list_clusters()] == ["up", "down"]
