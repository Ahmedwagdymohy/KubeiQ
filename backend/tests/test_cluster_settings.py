"""Clusters screen: labels, thresholds, display names, token connections, production guard."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from kubeiq.api.v1 import settings as settings_api
from kubeiq.clusters.base import ClusterStatus
from tests.test_settings import KUBECONFIG

CLUSTER = "upload:staging/staging"
CA = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----"


def _add_staging(client: TestClient) -> None:
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})


def test_labels_name_and_thresholds_show_on_the_cluster(client: TestClient) -> None:
    _add_staging(client)
    first = client.get("/api/v1/clusters", params={"all": True, "check": False}).json()
    assert first[0]["labels"] == [] and first[0]["added_at"]
    assert first[0]["context"] == "staging"

    saved = client.put(
        "/api/v1/settings/clusters/meta",
        json={
            "cluster_id": CLUSTER,
            "display_name": "Staging EU",
            "labels": [
                {"name": "Staging", "color": "amber"},
                {"name": "staging", "color": "red"},
                {"name": "eu", "color": "blue"},
            ],
            "namespace": "shop",
            "metrics": False,
            "cpu": {"warning": 50, "critical": 90},
        },
    )
    assert saved.status_code == 200
    cluster = client.get("/api/v1/clusters", params={"all": True, "check": False}).json()[0]
    assert cluster["name"] == "Staging EU" and cluster["context"] == "staging"
    assert [lbl["name"] for lbl in cluster["labels"]] == ["staging", "eu"]
    assert cluster["namespace"] == "shop"
    assert cluster["settings"]["cpu"] == {"warning": 50, "critical": 90}
    assert cluster["settings"]["memory"] == {"warning": 60, "critical": 80}
    assert cluster["settings"]["metrics"] is False
    assert "settings.cluster.edit" in [e["action"] for e in client.get("/api/v1/audit").json()]


@pytest.mark.parametrize(
    "body",
    [
        {"cpu": {"warning": 90, "critical": 80}},
        {"labels": [{"name": "x", "color": "orange"}]},
        {"labels": [{"name": "Not ok!", "color": "red"}]},
        {"labels": [{"name": f"l{i}", "color": "red"} for i in range(11)]},
        {"namespace": "Bad_NS"},
    ],
)
def test_cluster_settings_are_validated(client: TestClient, body: dict[str, Any]) -> None:
    response = client.put("/api/v1/settings/clusters/meta", json={"cluster_id": CLUSTER, **body})
    assert response.status_code == 422


def test_production_changes_need_the_cluster_name(client: TestClient) -> None:
    _add_staging(client)
    client.put("/api/v1/settings/changes", json={"enabled": True})
    client.put(
        "/api/v1/settings/clusters/meta",
        json={"cluster_id": CLUSTER, "labels": [{"name": "production", "color": "red"}]},
    )
    body = {
        "cluster_id": CLUSTER,
        "action": "restart",
        "group": "apps",
        "version": "v1",
        "resource": "deployments",
        "namespace": "shop",
        "name": "web",
    }
    refused = client.post("/api/v1/manager/actions", json=body)
    assert refused.status_code == 422 and "production" in refused.json()["detail"]
    wrong = client.post("/api/v1/manager/actions", json={**body, "confirm": "prod"})
    assert wrong.status_code == 422
    # With the name typed, the change goes on to the cluster (unreachable here, so 502).
    typed = client.post("/api/v1/manager/actions", json={**body, "confirm": "staging"})
    assert typed.status_code == 502


def _fake_test(result: ClusterStatus) -> Any:
    async def fake(body: Any, token: str) -> ClusterStatus:
        assert token
        return result

    return fake


TOKEN_BODY = {"name": "edge", "server": "https://10.0.0.5:6443", "token": "abc.def", "ca": CA}


def test_token_cluster_is_tested_then_saved(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        settings_api, "_test_token", _fake_test(ClusterStatus(reachable=False, error="Timed out"))
    )
    failed = client.post("/api/v1/settings/token-clusters", json=TOKEN_BODY)
    assert failed.status_code == 422 and failed.json()["detail"] == "Timed out"

    monkeypatch.setattr(
        settings_api, "_test_token", _fake_test(ClusterStatus(reachable=True, can_read=False))
    )
    no_read = client.post("/api/v1/settings/token-clusters", json=TOKEN_BODY)
    assert no_read.status_code == 422 and "kubeiq-readonly" in no_read.json()["detail"]

    ok = ClusterStatus(reachable=True, version="v1.31.0", can_read=True)
    monkeypatch.setattr(settings_api, "_test_token", _fake_test(ok))
    added = client.post("/api/v1/settings/token-clusters", json=TOKEN_BODY)
    assert added.status_code == 201
    assert client.post("/api/v1/settings/token-clusters", json=TOKEN_BODY).status_code == 409

    clusters = client.get("/api/v1/clusters", params={"all": True, "check": False}).json()
    edge = next(c for c in clusters if c["id"] == "token:edge")
    assert edge["method"] == "token" and edge["server"] == "https://10.0.0.5:6443"
    assert "abc.def" not in str(clusters)

    # Editing without a token keeps the saved one.
    edited = client.put(
        "/api/v1/settings/token-clusters/edge", json={**TOKEN_BODY, "token": None, "ca": None}
    )
    assert edited.status_code == 200
    assert client.post(
        "/api/v1/settings/token-clusters/test", json={**TOKEN_BODY, "token": None}
    ).json()["reachable"]

    assert client.delete("/api/v1/settings/token-clusters/edge").status_code == 204
    clusters = client.get("/api/v1/clusters", params={"all": True, "check": False}).json()
    assert all(c["id"] != "token:edge" for c in clusters)


@pytest.mark.parametrize(
    "change",
    [{"server": "http://10.0.0.5"}, {"ca": "not a cert"}, {"name": "Bad Name"}],
)
def test_token_input_is_validated(client: TestClient, change: dict[str, Any]) -> None:
    response = client.post("/api/v1/settings/token-clusters/test", json={**TOKEN_BODY, **change})
    assert response.status_code == 422


def test_token_clients_verify_tls_with_the_given_ca() -> None:
    from kubeiq.clusters.token import kubeconfig_for

    config = kubeconfig_for("edge", "https://x:6443", "t", CA)
    cluster = config["clusters"][0]["cluster"]
    assert "certificate-authority-data" in cluster
    assert "insecure-skip-tls-verify" not in cluster
    assert (
        "certificate-authority-data"
        not in kubeconfig_for("e", "https://x", "t", None)["clusters"][0]["cluster"]
    )
