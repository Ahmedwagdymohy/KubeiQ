import base64
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.auth.exceptions import DefaultCredentialsError

from kubeiq.clusters.base import ClusterNotFoundError, ConnectionMethod
from kubeiq.clusters.gke import NO_IDENTITY, NO_SCOPE, GkeProject, GkeSource
from kubeiq.clusters.registry import get_gke_source
from kubeiq.core.config import Settings
from kubeiq.main import create_app
from tests.conftest import AUTH

CA = b"-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n"


class FakeCredentials:
    """Stands in for google.auth credentials: starts expired, refresh issues a new token."""

    service_account_email = "kubeiq@prod.iam.gserviceaccount.com"

    def __init__(self) -> None:
        self.token: str | None = None
        self.refreshes = 0

    @property
    def valid(self) -> bool:
        return self.token is not None

    def refresh(self, _request: object) -> None:
        self.refreshes += 1
        self.token = f"token-{self.refreshes}"


class FakeResponse:
    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        self.status_code = status_code
        self.reason = "error"
        self._body = body

    def json(self) -> dict[str, Any]:
        return self._body


def cluster(name: str, location: str = "us-central1", private: str | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {
        "name": name,
        "location": location,
        "endpoint": "34.1.2.3",
        "masterAuth": {"clusterCaCertificate": base64.b64encode(CA).decode()},
    }
    if private:
        item["privateClusterConfig"] = {"privateEndpoint": private}
    return item


def source_with(responses: dict[str, FakeResponse]) -> tuple[GkeSource, FakeCredentials]:
    credentials = FakeCredentials()

    class Session:
        def __init__(self, _credentials: object) -> None: ...

        def get(self, url: str, timeout: float) -> FakeResponse:
            project = url.split("/projects/")[1].split("/")[0]
            return responses[project]

    return GkeSource(credentials=lambda: credentials, session=Session), credentials  # type: ignore[arg-type,return-value]


def test_discovers_clusters_of_each_project() -> None:
    source, _ = source_with(
        {
            "prod-project": FakeResponse(
                200, {"clusters": [cluster("api"), cluster("jobs", "europe-west1-b")]}
            ),
            "data-project": FakeResponse(200, {}),
        }
    )
    source.set_projects(
        [GkeProject(project_id="prod-project"), GkeProject(project_id="data-project")]
    )
    source.discover()

    clusters = source.list_clusters()
    assert [c.id for c in clusters] == [
        "gke:prod-project/us-central1/api",
        "gke:prod-project/europe-west1-b/jobs",
    ]
    assert all(
        c.method == ConnectionMethod.GKE and c.server == "https://34.1.2.3" for c in clusters
    )
    assert [(p.project_id, p.clusters, p.error) for p in source.status()] == [
        ("prod-project", 2, None),
        ("data-project", 0, None),
    ]


def test_internal_ip_uses_the_private_endpoint() -> None:
    source, _ = source_with(
        {"prod-project": FakeResponse(200, {"clusters": [cluster("api", private="10.0.0.2")]})}
    )
    source.set_projects([GkeProject(project_id="prod-project", internal_ip=True)])
    source.discover()
    assert source.list_clusters()[0].server == "https://10.0.0.2"


def test_client_trusts_the_cluster_ca_and_sends_a_fresh_token() -> None:
    source, credentials = source_with(
        {"prod-project": FakeResponse(200, {"clusters": [cluster("api")]})}
    )
    source.set_projects([GkeProject(project_id="prod-project")])
    source.discover()

    configuration = source.api_client("gke:prod-project/us-central1/api").configuration
    assert configuration.host == "https://34.1.2.3"
    assert Path(configuration.ssl_ca_cert).read_bytes() == CA
    assert configuration.get_api_key_with_prefix("authorization") == "Bearer token-1"

    credentials.token = None  # expired
    assert configuration.get_api_key_with_prefix("authorization") == "Bearer token-2"


def test_unknown_cluster_raises() -> None:
    source, _ = source_with({})
    with pytest.raises(ClusterNotFoundError):
        source.api_client("gke:prod-project/us-central1/missing")


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (
            FakeResponse(
                403, {"error": {"message": "Request had insufficient authentication scopes."}}
            ),
            NO_SCOPE,
        ),
        (
            FakeResponse(
                403, {"error": {"message": "denied", "details": [{"reason": "SERVICE_DISABLED"}]}}
            ),
            "The Kubernetes Engine API is not enabled in project prod-project",
        ),
        (
            FakeResponse(403, {"error": {"message": "Permission denied"}}),
            "kubeiq@prod.iam.gserviceaccount.com needs the role Kubernetes Engine Cluster Viewer "
            "(roles/container.clusterViewer) on project prod-project",
        ),
        (FakeResponse(404, {}), "Project prod-project was not found"),
    ],
)
def test_explains_gke_api_errors(response: FakeResponse, expected: str) -> None:
    source, _ = source_with({"prod-project": response})
    source.set_projects([GkeProject(project_id="prod-project")])
    source.discover()
    assert source.status()[0].error == expected
    assert source.list_clusters() == []


def test_identity_without_google_credentials() -> None:
    def missing() -> Any:
        raise DefaultCredentialsError("none")

    assert GkeSource(credentials=missing).identity().error == NO_IDENTITY


def test_identity_reports_the_service_account() -> None:
    source, _ = source_with({})
    identity = source.identity()
    assert identity.email == "kubeiq@prod.iam.gserviceaccount.com"
    assert identity.error is None


def test_settings_api_saves_projects_and_lists_clusters() -> None:
    source, _ = source_with({"prod-project": FakeResponse(200, {"clusters": [cluster("api")]})})
    app = create_app(Settings(env="test"))
    app.dependency_overrides[get_gke_source] = lambda: source
    client = TestClient(app, headers=AUTH)

    body = client.put(
        "/api/v1/settings/gke", json={"projects": [{"project_id": "prod-project"}]}
    ).json()
    assert body["identity"]["email"] == "kubeiq@prod.iam.gserviceaccount.com"
    assert body["projects"] == [
        {"project_id": "prod-project", "internal_ip": False, "clusters": 1, "error": None}
    ]
    assert client.get("/api/v1/settings/gke").json() == body

    invalid = client.put(
        "/api/v1/settings/gke", json={"projects": [{"project_id": "Not A Project"}]}
    )
    assert invalid.status_code == 422
