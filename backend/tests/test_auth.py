"""Sign-in, the free-plan user limit, and project-scoped access."""

from fastapi.testclient import TestClient

from kubeiq.auth.access import Access, Grant
from kubeiq.auth.passwords import hash_password, verify_password
from tests.conftest import MASTER_KEY
from tests.test_settings import KUBECONFIG


def _anonymous(client: TestClient) -> TestClient:
    return TestClient(client.app)


def _sign_in(client: TestClient, username: str, password: str) -> TestClient:
    browser = _anonymous(client)
    response = browser.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return browser


def test_requests_without_a_session_are_rejected(client: TestClient) -> None:
    browser = _anonymous(client)
    assert browser.get("/api/v1/clusters").status_code == 401
    assert (
        browser.get("/api/v1/clusters", headers={"Authorization": "Bearer nope"}).status_code == 401
    )
    assert browser.get("/healthz").status_code == 200


def test_admin_signs_in_with_the_master_key(client: TestClient) -> None:
    browser = _anonymous(client)
    wrong = browser.post("/api/v1/auth/login", json={"username": "admin", "password": "x"})
    assert wrong.status_code == 401

    browser = _sign_in(client, "admin", MASTER_KEY)
    me = browser.get("/api/v1/auth/me").json()
    assert (me["username"], me["role"]) == ("admin", "admin")
    assert browser.get("/api/v1/settings/ai").status_code == 200

    browser.post("/api/v1/auth/logout")
    assert browser.get("/api/v1/auth/me").status_code == 401


def test_free_plan_allows_three_users(client: TestClient) -> None:
    for name in ("alice", "bob"):
        created = client.post("/api/v1/users", json={"username": name})
        assert created.status_code == 201
        assert len(created.json()["password"]) >= 12  # generated and shown once
    listing = client.get("/api/v1/users").json()
    assert [u["username"] for u in listing["users"]] == ["admin", "alice", "bob"]
    assert listing["max_users"] == 3
    assert client.post("/api/v1/users", json={"username": "carol"}).status_code == 402


def test_project_limits_what_a_user_sees(client: TestClient) -> None:
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})
    client.post("/api/v1/settings/kubeconfigs", json={"name": "prod", "content": KUBECONFIG})
    user = client.post("/api/v1/users", json={"username": "dev", "password": "dev-password"}).json()
    project = client.post(
        "/api/v1/projects",
        json={
            "name": "Shop",
            "scopes": [{"cluster_id": "upload:staging/staging", "namespaces": ["shop"]}],
            "members": [{"user_id": user["id"], "role": "viewer"}],
        },
    )
    assert project.status_code == 201

    dev = _sign_in(client, "dev", "dev-password")
    assert [c["id"] for c in dev.get("/api/v1/clusters?check=false").json()] == [
        "upload:staging/staging"
    ]
    assert dev.get("/api/v1/clusters/upload:staging/staging/namespaces").json() == ["shop"]
    assert dev.get("/api/v1/clusters/upload:prod/staging/namespaces").status_code == 403
    assert dev.get("/api/v1/map?cluster_id=upload:staging/staging").status_code == 403
    assert (
        dev.get("/api/v1/map?cluster_id=upload:staging/staging&namespace=other").status_code == 403
    )
    assert dev.get("/api/v1/settings/ai").status_code == 403
    assert dev.get("/api/v1/users").status_code == 403
    assert dev.get("/api/v1/auth/me").json()["projects"][0]["project"] == "Shop"

    actions = [e["action"] for e in client.get("/api/v1/audit").json()]
    assert "project.create" in actions and "auth.login" in actions


def test_user_changes_their_password(client: TestClient) -> None:
    client.post("/api/v1/users", json={"username": "erin", "password": "first-password"})
    erin = _sign_in(client, "erin", "first-password")
    bad = erin.post("/api/v1/auth/password", json={"current": "nope", "new": "second-password"})
    assert bad.status_code == 400
    ok = erin.post(
        "/api/v1/auth/password", json={"current": "first-password", "new": "second-password"}
    )
    assert ok.status_code == 204
    _sign_in(client, "erin", "second-password")


def test_repeated_failures_are_throttled(client: TestClient) -> None:
    browser = _anonymous(client)
    codes = [
        browser.post(
            "/api/v1/auth/login", json={"username": "mallory", "password": "x"}
        ).status_code
        for _ in range(6)
    ]
    assert codes[-1] == 429


def test_access_rules() -> None:
    access = Access(
        grants=(
            Grant("c1", frozenset({"shop"}), "editor"),
            Grant("c2", None, "viewer"),
        )
    )
    assert access.can("edit", "c1", "shop")
    assert not access.can("read", "c1", None)
    assert not access.can("read", "c1", "other")
    assert access.can("read", "c2", None)
    assert not access.can("edit", "c2", "any")
    assert access.namespaces("c1") == {"shop"}
    assert access.namespaces("c2") is None
    assert Access(admin=True).can("edit", "anything", None)


def test_password_hashing() -> None:
    stored = hash_password("s3cret-pass")
    assert verify_password("s3cret-pass", stored)
    assert not verify_password("wrong", stored)
    assert "s3cret" not in stored
