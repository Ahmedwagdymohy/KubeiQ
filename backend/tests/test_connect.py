import asyncio
import errno
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from kubernetes.client.exceptions import ApiException
from urllib3.exceptions import ConnectTimeoutError, MaxRetryError, NewConnectionError

from kubeiq.api.v1 import settings as settings_api
from kubeiq.auth import membership
from kubeiq.clusters import registry as registry_module
from kubeiq.clusters.base import ClusterStatus
from kubeiq.clusters.errors import UNREACHABLE, describe_error
from kubeiq.connect import service
from kubeiq.db import session as db_session
from tests.test_gke import FakeResponse, cluster, source_with
from tests.test_settings import KUBECONFIG

REPO = Path(__file__).resolve().parents[2]
CLUSTER = "upload:staging/staging"


@pytest.fixture
def reachable(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Every kubeconfig tested by the connect flow answers; returns the servers it was asked."""
    asked: list[str] = []

    async def fake_test(config: Any, context: str, server: str | None) -> ClusterStatus:
        asked.append(server or "")
        return ClusterStatus(reachable=True, version="v1.31.0", can_read=True)

    monkeypatch.setattr(service, "_test", fake_test)
    return asked


def new_code(client: TestClient, **body: Any) -> dict[str, Any]:
    response = client.post("/api/v1/connect/codes", json=body)
    assert response.status_code == 201
    data: dict[str, Any] = response.json()
    return data


def hand_over(
    client: TestClient, code: str, content: str = KUBECONFIG, name: str = "staging"
) -> Any:
    return client.post(
        "/api/v1/connect",
        params={"name": name},
        content=content,
        headers={"Authorization": f"Bearer {code}", "Content-Type": "application/yaml"},
    )


def test_assets_match_the_published_scripts() -> None:
    """KubeiQ serves copies of deploy/; run `make sync-connect` after changing them."""
    assets = REPO / "backend/src/kubeiq/connect/assets"
    assert (assets / "connect.sh").read_text() == (REPO / "deploy/connect.sh").read_text()
    for file in service.RBAC_FILES:
        assert (assets / "rbac" / file).read_text() == (REPO / "deploy/rbac" / file).read_text()


def test_script_reports_back_to_the_address_it_came_from(client: TestClient) -> None:
    response = client.get("/api/v1/connect.sh", headers={"Host": "kubeiq.example.com:3000"})
    assert response.status_code == 200
    assert 'KUBEIQ_URL="${KUBEIQ_URL:-http://kubeiq.example.com:3000}"' in response.text

    proxied = client.get(
        "/api/v1/connect.sh",
        headers={"X-Forwarded-Proto": "https", "X-Forwarded-Host": "kubeiq.example.com"},
    )
    assert 'KUBEIQ_URL="${KUBEIQ_URL:-https://kubeiq.example.com}"' in proxied.text

    # Nothing from a header reaches the script unless it is a plain host name.
    injected = client.get("/api/v1/connect.sh", headers={"X-Forwarded-Host": 'x"; evil_cmd; "'})
    assert "evil_cmd" not in injected.text


def test_rbac_files_are_served_and_nothing_else(client: TestClient) -> None:
    assert "kubeiq-readonly" in client.get("/api/v1/connect/rbac/kubeiq-readonly.yaml").text
    assert client.get("/api/v1/connect/rbac/..%2F..%2Fsecret").status_code == 404


def test_codes_are_for_admins_and_go_to_the_only_project(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Platform"}).json()
    code = new_code(client)
    assert code["project"] == "Platform"
    assert code["code"].startswith("kqc_")
    assert client.get(f"/api/v1/connect/codes/{code['id']}").json()["state"] == "waiting"
    assert new_code(client, project_id=project["id"])["project"] == "Platform"
    assert client.post("/api/v1/connect/codes", json={"project_id": "nope"}).status_code == 404

    signed_out = client.post("/api/v1/connect/codes", json={}, headers={"Authorization": ""})
    assert signed_out.status_code == 401


def test_check_rejects_unknown_codes(client: TestClient) -> None:
    code = new_code(client)["code"]
    assert (
        client.get("/api/v1/connect/check", headers={"Authorization": f"Bearer {code}"}).text
        == "ok\n"
    )
    bad = client.get("/api/v1/connect/check", headers={"Authorization": "Bearer kqc_wrong"})
    assert bad.status_code == 401
    assert "expired" in bad.text


def test_connect_saves_the_cluster_into_the_project_once(
    client: TestClient, reachable: list[str]
) -> None:
    client.post("/api/v1/projects", json={"name": "Platform"})
    code = new_code(client)

    response = hand_over(client, code["code"])
    assert response.status_code == 200
    assert response.text == "Done. staging is connected to KubeiQ and is in project Platform\n"
    assert reachable == ["https://10.0.0.1:6443"]

    assert [c["id"] for c in client.get("/api/v1/clusters", params={"check": False}).json()] == [
        CLUSTER
    ]
    state = client.get(f"/api/v1/connect/codes/{code['id']}").json()
    assert state == {
        "state": "connected",
        "expires_at": state["expires_at"],
        "cluster_id": CLUSTER,
        "cluster": "staging",
        "version": "v1.31.0",
        "error": None,
        "note": None,
    }
    audit = client.get("/api/v1/audit").json()
    assert audit[0]["action"] == "settings.kubeconfig.connect"
    assert audit[0]["username"] == "admin"

    again = hand_over(client, code["code"])
    assert again.status_code == 401  # one cluster per code


def test_unreachable_cluster_is_reported_and_the_code_stays_usable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def unreachable(config: Any, context: str, server: str | None) -> ClusterStatus:
        return ClusterStatus(
            reachable=False, error=f"Cluster unreachable: {server} does not answer"
        )

    monkeypatch.setattr(service, "_test", unreachable)
    code = new_code(client)
    response = hand_over(client, code["code"])
    assert response.status_code == 409
    assert "does not answer" in response.text
    state = client.get(f"/api/v1/connect/codes/{code['id']}").json()
    assert state["state"] == "failed"
    assert "does not answer" in state["error"]
    assert client.get("/api/v1/settings/kubeconfigs").json() == []

    async def answers(config: Any, context: str, server: str | None) -> ClusterStatus:
        return ClusterStatus(reachable=True, version="v1.31.0", can_read=True)

    monkeypatch.setattr(service, "_test", answers)
    assert hand_over(client, code["code"]).status_code == 200  # after linking the networks


def test_expired_code_and_invalid_kubeconfig(
    client: TestClient, reachable: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    code = new_code(client)
    bad = hand_over(client, code["code"], content="kind: Pod")
    assert bad.status_code == 422
    assert "cannot use this kubeconfig" in bad.text

    monkeypatch.setattr(service, "CODE_TTL", service.CODE_TTL * -1)
    old = new_code(client)
    assert hand_over(client, old["code"]).status_code == 401
    assert client.get(f"/api/v1/connect/codes/{old['id']}").json()["state"] == "expired"


def test_same_cluster_again_replaces_it_and_another_gets_a_new_name(
    client: TestClient, reachable: list[str]
) -> None:
    assert hand_over(client, new_code(client)["code"]).status_code == 200
    assert hand_over(client, new_code(client)["code"]).status_code == 200
    other = KUBECONFIG.replace("10.0.0.1", "10.0.0.2")
    assert hand_over(client, new_code(client)["code"], content=other).status_code == 200
    names = [k["name"] for k in client.get("/api/v1/settings/kubeconfigs").json()]
    assert names == ["staging", "staging-2"]


def test_over_the_plan_the_cluster_connects_outside_the_project(
    client: TestClient, reachable: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(membership.plan, "max_clusters", lambda: 0)
    client.post("/api/v1/projects", json={"name": "Platform"})
    response = hand_over(client, new_code(client)["code"])
    assert response.status_code == 200
    assert "not in project Platform yet" in response.text


def test_network_errors_name_the_address_and_the_cause() -> None:
    server = "https://192.168.49.2:8443"
    timeout = MaxRetryError(None, "/version", ConnectTimeoutError(None, "timed out"))  # type: ignore[arg-type]
    assert "192.168.49.2:8443 does not answer" in describe_error(timeout, server)
    assert "Docker network" in describe_error(timeout, server)

    refused = ConnectionRefusedError(errno.ECONNREFUSED, "Connection refused")
    assert describe_error(refused, server).endswith("refused the connection. Nothing listens there")
    assert describe_error(refused).startswith("Cluster unreachable")

    wrapped = MaxRetryError(None, "/", NewConnectionError(None, "Failed: [Errno 111] refused"))  # type: ignore[arg-type]
    assert "refused the connection" in describe_error(wrapped, server)
    assert describe_error(OSError("odd"), server) == UNREACHABLE


async def test_reachable_cluster_without_read_access_is_flagged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Forbidden:
        def __init__(self, _client: object) -> None: ...

        def list_namespace(self, **_: object) -> None:
            raise ApiException(status=403)

    monkeypatch.setattr(registry_module, "CoreV1Api", Forbidden)
    status = await registry_module.probe_read(object(), ClusterStatus(reachable=True))  # type: ignore[arg-type]
    assert status.can_read is False
    assert status.error == registry_module.NO_READ_ACCESS


def test_gke_check_lists_clusters_and_their_access(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    source, _ = source_with(
        {
            "shop-prod": FakeResponse(200, {"clusters": [cluster("web"), cluster("jobs")]}),
            "nope-project": FakeResponse(404, {}),
        }
    )
    client.app.dependency_overrides[registry_module.get_gke_source] = lambda: source  # type: ignore[attr-defined]

    class Version:
        def __init__(self, _client: object) -> None: ...

        def get_code(self, **_: object) -> Any:
            return SimpleNamespace(git_version="v1.30.4-gke.1")

    calls: list[int] = []

    async def probe(client_: Any, status: ClusterStatus) -> ClusterStatus:
        calls.append(1)  # the second cluster has no RBAC binding for KubeiQ yet
        return status.model_copy(update={"can_read": len(calls) == 1})

    monkeypatch.setattr(settings_api, "VersionApi", Version)
    monkeypatch.setattr(settings_api, "probe_read", probe)
    body = client.post("/api/v1/settings/gke/check", json={"project_id": "shop-prod"}).json()
    assert body["error"] is None
    assert [(c["name"], c["reachable"], c["can_read"]) for c in body["clusters"]] == [
        ("web", True, True),
        ("jobs", True, False),
    ]
    assert source.projects == []  # checking saves nothing

    missing = client.post("/api/v1/settings/gke/check", json={"project_id": "nope-project"})
    assert "was not found" in missing.json()["error"]


GCLOUD_KUBECONFIG = """
apiVersion: v1
kind: Config
current-context: gke_shop_us-central1-a_dev
clusters:
  - name: gke_shop_us-central1-a_dev
    cluster: {server: "https://10.13.0.2", certificate-authority-data: "Zm9v"}
contexts:
  - name: gke_shop_us-central1-a_dev
    context: {cluster: gke_shop_us-central1-a_dev, user: me}
users:
  - name: me
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1beta1
        command: /usr/lib/google-cloud-sdk/bin/gke-gcloud-auth-plugin
"""


async def test_contexts_that_log_in_through_a_cli_say_so(tmp_path: Path) -> None:
    from kubeiq.clusters.kubeconfig import KubeconfigSource

    path = tmp_path / "config"
    path.write_text(GCLOUD_KUBECONFIG)
    source = KubeconfigSource(str(path))
    [info] = source.list_clusters()
    assert info.login == "gke-gcloud-auth-plugin"

    status = await registry_module.ClusterRegistry([source]).check(info.id)
    assert status.reachable is False
    assert status.error is not None
    assert status.error.startswith("Logs in through gcloud, which KubeiQ cannot use")


def test_pasted_kubeconfig_joins_the_only_project(client: TestClient) -> None:
    client.post("/api/v1/projects", json={"name": "Platform"})
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})
    listed = client.get("/api/v1/clusters", params={"check": False}).json()
    assert [c["id"] for c in listed] == [CLUSTER]


def test_hidden_clusters_leave_lists_and_projects(client: TestClient) -> None:
    client.post("/api/v1/projects", json={"name": "Platform"})
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})
    hide = {"cluster_id": CLUSTER, "hidden": True}
    assert client.put("/api/v1/settings/clusters/hidden", json=hide).status_code == 204

    assert client.get("/api/v1/clusters", params={"check": False}).json() == []
    every = client.get("/api/v1/clusters", params={"check": False, "all": True}).json()
    assert [(c["id"], c["hidden"]) for c in every] == [(CLUSTER, True)]
    assert client.get("/api/v1/projects").json()[0]["scopes"] == []

    show = {"cluster_id": CLUSTER, "hidden": False}
    client.put("/api/v1/settings/clusters/hidden", json=show)
    every = client.get("/api/v1/clusters", params={"check": False, "all": True}).json()
    assert every[0]["hidden"] is False


def test_fix_puts_the_new_cluster_in_the_old_ones_place(
    client: TestClient, reachable: list[str]
) -> None:
    broken = "kubeconfig:gke_shop_us-central1-a_dev"
    scopes = [{"cluster_id": broken, "namespaces": ["shop"]}]
    client.post("/api/v1/projects", json={"name": "Platform", "scopes": scopes})

    code = new_code(client, replaces=broken)
    response = hand_over(client, code["code"])
    assert response.status_code == 200
    assert "in project Platform" in response.text

    project = client.get("/api/v1/projects").json()[0]
    assert project["scopes"] == [{"cluster_id": CLUSTER, "namespaces": ["shop"]}]
    every = client.get("/api/v1/clusters", params={"check": False, "all": True}).json()
    assert {c["id"]: c["hidden"] for c in every}[CLUSTER] is False

    async def hidden_ids() -> set[str]:
        async with db_session.get_sessionmaker()() as session:
            return await membership.hidden(session)

    assert asyncio.run(hidden_ids()) == {broken}  # the broken context is hidden
