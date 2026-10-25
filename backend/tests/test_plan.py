from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from kubeiq.auth import plan
from tests.test_auth import _sign_in
from tests.test_settings import KUBECONFIG

STAGING = "upload:staging/staging"


def scopes(*clusters: str) -> list[dict[str, Any]]:
    return [{"cluster_id": c, "namespaces": []} for c in clusters]


def test_first_admin_sign_in_needs_setup_until_a_project_exists(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").json()["setup_needed"] is True
    assert client.post("/api/v1/projects", json={"name": "Platform"}).status_code == 201
    assert client.get("/api/v1/auth/me").json()["setup_needed"] is False


def test_free_plan_allows_one_project(client: TestClient) -> None:
    assert client.post("/api/v1/projects", json={"name": "Platform"}).status_code == 201
    second = client.post("/api/v1/projects", json={"name": "Data"})
    assert second.status_code == 402
    assert "1 project" in second.json()["detail"]


def test_clusters_are_used_once_they_are_in_a_project(client: TestClient) -> None:
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})

    def listed(**params: Any) -> list[str]:
        response = client.get("/api/v1/clusters", params={"check": False, **params})
        return [c["id"] for c in response.json()]

    assert listed() == []  # connected, not in a project yet
    assert listed(all=True) == [STAGING]  # available to add
    client.post("/api/v1/projects", json={"name": "Platform", "scopes": scopes(STAGING)})
    assert listed() == [STAGING]


def test_free_plan_allows_three_clusters_and_keeps_existing_ones(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = client.post(
        "/api/v1/projects", json={"name": "Platform", "scopes": scopes("a", "b", "c")}
    )
    project_id = created.json()["id"]
    put: Callable[..., Any] = lambda *c: client.put(  # noqa: E731
        f"/api/v1/projects/{project_id}", json={"name": "Platform", "scopes": scopes(*c)}
    )

    over = put("a", "b", "c", "d")
    assert over.status_code == 402
    assert "3 clusters" in over.json()["detail"]

    monkeypatch.setattr(plan, "max_clusters", lambda: 2)  # an install already over the limit
    assert put("a", "b", "c").status_code == 200  # keeps working
    assert put("a", "b", "d").status_code == 200  # swapping one is not adding
    assert put("a", "b", "c", "d").status_code == 402
    assert put("a").status_code == 200

    usage = client.get("/api/v1/plan").json()
    assert usage["plan"] == "Free"
    assert usage["projects"] == {"used": 1, "max": 1}
    assert usage["clusters"] == {"used": 1, "max": 2}
    assert usage["users"]["max"] == 3


def test_only_admins_list_every_cluster(client: TestClient) -> None:
    client.post("/api/v1/users", json={"username": "dev", "password": "dev-password"})
    dev = _sign_in(client, "dev", "dev-password")
    assert dev.get("/api/v1/clusters", params={"all": True}).status_code == 403
    assert dev.get("/api/v1/auth/me").json()["setup_needed"] is False
