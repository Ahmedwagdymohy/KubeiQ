from typing import Any

from fastapi.testclient import TestClient

from tests.test_auth import _sign_in


def invite(client: TestClient, email: str, role: str, **extra: Any) -> Any:
    return client.post("/api/v1/users/invite", json={"email": email, "role": role, **extra})


def members(client: TestClient) -> list[tuple[str, str]]:
    project = client.get("/api/v1/projects").json()[0]
    return [(m["username"], m["role"]) for m in project["members"]]


def test_editors_and_viewers_join_the_project(client: TestClient) -> None:
    client.post("/api/v1/projects", json={"name": "Platform"})
    viewer = invite(client, "Vera@Acme.io", "viewer")
    assert viewer.status_code == 201
    assert invite(client, "ed@acme.io", "editor").status_code == 201
    assert members(client) == [("ed@acme.io", "editor"), ("vera@acme.io", "viewer")]

    # Google sign-in is off: they get a password, shown once, and can sign in with it.
    body = viewer.json()
    assert (body["username"], body["role"], body["auth_provider"]) == (
        "vera@acme.io",
        "user",
        "password",
    )
    me = _sign_in(client, "vera@acme.io", body["password"]).get("/api/v1/auth/me").json()
    assert me["projects"][0]["role"] == "viewer"


def test_admins_need_no_project(client: TestClient) -> None:
    body = invite(client, "boss@acme.io", "admin").json()
    assert body["role"] == "admin"
    assert body["projects"] == []


def test_invites_are_checked(client: TestClient) -> None:
    assert invite(client, "not-an-email", "viewer").status_code == 422
    no_project = invite(client, "vera@acme.io", "viewer")
    assert no_project.status_code == 422
    assert no_project.json()["detail"] == "Create a project first"

    client.post("/api/v1/projects", json={"name": "Platform"})
    assert invite(client, "vera@acme.io", "viewer").status_code == 201
    again = invite(client, "VERA@acme.io", "editor")
    assert again.status_code == 409
    assert invite(client, "two@acme.io", "viewer").status_code == 201
    assert invite(client, "three@acme.io", "viewer").status_code == 402  # admin + 2 = 3 users
