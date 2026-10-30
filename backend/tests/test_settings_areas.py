"""Settings areas: workspace display settings, user status, About, the danger zone."""

from fastapi.testclient import TestClient

from tests.test_settings import KUBECONFIG


def test_workspace_settings_are_read_by_everyone(client: TestClient) -> None:
    assert client.get("/api/v1/me/workspace").json()["show_usage"] is True
    body = {
        "show_usage": False,
        "namespace_badges": True,
        "compact_rows": True,
        "confirm_delete": True,
    }
    assert client.put("/api/v1/settings/general", json=body).json() == body
    client.post("/api/v1/users", json={"username": "viewer", "password": "viewer-pass"})
    viewer = TestClient(client.app)
    viewer.post("/api/v1/auth/login", json={"username": "viewer", "password": "viewer-pass"})
    assert viewer.get("/api/v1/me/workspace").json()["compact_rows"] is True
    assert viewer.put("/api/v1/settings/general", json=body).status_code == 403


def test_users_show_invited_until_first_sign_in(client: TestClient) -> None:
    client.post("/api/v1/users", json={"username": "dana", "password": "dana-pass-1"})
    user = next(u for u in client.get("/api/v1/users").json()["users"] if u["username"] == "dana")
    assert user["status"] == "invited" and user["last_sign_in"] is None
    other = TestClient(client.app)
    other.post("/api/v1/auth/login", json={"username": "dana", "password": "dana-pass-1"})
    user = next(u for u in client.get("/api/v1/users").json()["users"] if u["username"] == "dana")
    assert user["status"] == "active" and user["last_sign_in"]


def test_about_has_diagnostics(client: TestClient) -> None:
    about = client.get("/api/v1/settings/about").json()
    assert about["python"] and about["started_at"] and "clusters" in about


def test_danger_zone_needs_the_typed_phrase(client: TestClient) -> None:
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})
    assert (
        client.post("/api/v1/settings/danger/remove-clusters", json={"confirm": "yes"}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/settings/danger/remove-clusters", json={"confirm": "Remove clusters"}
        ).status_code
        == 204
    )
    assert client.get("/api/v1/settings/kubeconfigs").json() == []
    assert (
        client.post(
            "/api/v1/settings/danger/clear-activity", json={"confirm": "clear activity"}
        ).status_code
        == 204
    )
    assert [e["action"] for e in client.get("/api/v1/audit").json()] == ["settings.activity.clear"]


def test_reset_keeps_the_admin_and_the_log(client: TestClient) -> None:
    client.post("/api/v1/projects", json={"name": "Shop", "scopes": [], "members": []})
    client.post("/api/v1/users", json={"username": "erin", "password": "erin-pass-1"})
    assert (
        client.post(
            "/api/v1/settings/danger/reset", json={"confirm": "reset workspace"}
        ).status_code
        == 204
    )
    assert client.get("/api/v1/projects").json() == []
    assert [u["username"] for u in client.get("/api/v1/users").json()["users"]] == ["admin"]
    assert client.get("/api/v1/audit").json()[0]["action"] == "settings.reset"
