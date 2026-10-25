from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from kubeiq.auth import google
from tests.test_auth import _anonymous

SETTINGS = {"enabled": True, "client_id": "client-123", "client_secret": "secret-abcd"}


def enable(client: TestClient, **extra: Any) -> dict[str, Any]:
    response = client.put("/api/v1/settings/google", json=SETTINGS | extra)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def sign_in(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, email: str, next_path: str = "/"
) -> Any:
    """Run the browser flow; Google is replaced by a verified email."""
    monkeypatch.setattr(google, "verified_email", lambda *_: email)
    browser = _anonymous(client)
    start = browser.get(
        "/api/v1/auth/google/start", params={"next": next_path}, follow_redirects=False
    )
    assert start.status_code == 303
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = browser.get(
        "/api/v1/auth/google/callback", params={"code": "c", "state": state}, follow_redirects=False
    )
    return browser, callback


def test_settings_keep_the_secret_write_only(client: TestClient) -> None:
    assert client.get("/api/v1/auth/providers").json() == {"google": False}
    off = client.put("/api/v1/settings/google", json={"enabled": True, "client_id": "client-123"})
    assert off.status_code == 422

    body = enable(client)
    assert body["client_secret_set"] is True
    assert body["client_secret_hint"] == "abcd"  # noqa: S105 - last 4 of a test value
    assert "secret-abcd" not in str(body)
    assert body["redirect_uri"].endswith("/api/v1/auth/google/callback")
    assert client.get("/api/v1/auth/providers").json() == {"google": True}

    kept = client.put("/api/v1/settings/google", json={**SETTINGS, "client_secret": None})
    assert kept.json()["client_secret_hint"] == "abcd"  # noqa: S105


def test_start_sends_the_browser_to_google_with_pkce(client: TestClient) -> None:
    enable(client)
    start = _anonymous(client).get("/api/v1/auth/google/start", follow_redirects=False)
    url = urlparse(start.headers["location"])
    query = parse_qs(url.query)
    assert url.netloc == "accounts.google.com"
    assert query["client_id"] == ["client-123"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["openid email profile"]
    assert query["redirect_uri"][0].endswith("/api/v1/auth/google/callback")
    assert google.STATE_COOKIE in start.cookies


def test_invited_user_signs_in_and_returns_to_the_page(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    enable(client)
    client.post("/api/v1/projects", json={"name": "Platform"})
    invite = client.post("/api/v1/users/invite", json={"email": "Alice@Acme.io", "role": "viewer"})
    assert invite.json()["password"] is None  # Google is on: no password
    browser, callback = sign_in(client, monkeypatch, "alice@acme.io", "/doctor")
    assert callback.status_code == 303
    assert callback.headers["location"] == "/doctor"
    me = browser.get("/api/v1/auth/me").json()
    assert (me["username"], me["auth_provider"], me["builtin"]) == (
        "alice@acme.io",
        "google",
        False,
    )
    assert [p["role"] for p in me["projects"]] == ["viewer"]


def test_only_allowed_emails_get_in(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    enable(client)
    browser, callback = sign_in(client, monkeypatch, "carol@acme.io")
    assert callback.headers["location"] == "/login?error=not_invited"
    assert browser.get("/api/v1/auth/me").status_code == 401
    assert len(client.get("/api/v1/users").json()["users"]) == 1  # nobody was created


def test_a_forged_state_or_unsafe_next_is_refused(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    enable(client)
    client.post("/api/v1/users", json={"username": "alice@acme.io"})
    monkeypatch.setattr(google, "verified_email", lambda *_: "alice@acme.io")
    browser = _anonymous(client)
    browser.get("/api/v1/auth/google/start", follow_redirects=False)
    forged = browser.get(
        "/api/v1/auth/google/callback",
        params={"code": "c", "state": "forged"},
        follow_redirects=False,
    )
    assert forged.headers["location"] == "/login?error=expired"

    _, callback = sign_in(client, monkeypatch, "alice@acme.io", "//evil.example")
    assert callback.headers["location"] == "/"


def test_id_token_must_match_the_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    config = google.GoogleConfig("client-123", "secret")
    flow = {"verifier": "v", "nonce": "n", "state": "s", "next": "/"}

    class Response:
        ok = True

        def json(self) -> dict[str, str]:
            return {"id_token": "token"}

    monkeypatch.setattr(google.requests, "post", lambda *_, **__: Response())
    claims: dict[str, Any] = {"nonce": "n", "email": "Alice@Acme.io", "email_verified": True}
    monkeypatch.setattr(google.id_token, "verify_oauth2_token", lambda *_: claims)
    assert google.verified_email(config, "code", "https://x/cb", flow) == "alice@acme.io"

    for bad in ({"nonce": "other"}, {"email_verified": False}):
        monkeypatch.setattr(google.id_token, "verify_oauth2_token", lambda *_, b=bad: claims | b)
        with pytest.raises(google.GoogleSignInError):
            google.verified_email(config, "code", "https://x/cb", flow)
