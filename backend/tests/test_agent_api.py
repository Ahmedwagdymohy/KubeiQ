"""KubeiQ Agent routes: install codes, the served manifest, registration, the tunnel, revoke."""

from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from kubeiq.tunnel import service
from kubeiq.tunnel.hub import get_hub
from tests.test_auth import _anonymous, _sign_in


def add(client: TestClient, name: str = "edge", **body: Any) -> dict[str, Any]:
    response = client.post("/api/v1/agent/clusters", json={"name": name, **body})
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


def register(client: TestClient, code: str) -> Any:
    return _anonymous(client).post(
        "/api/v1/agent/register", headers={"Authorization": f"Bearer {code}"}
    )


def states(client: TestClient) -> dict[str, str]:
    return {c["name"]: c["state"] for c in client.get("/api/v1/agent/clusters").json()}


def audit_actions(client: TestClient) -> list[str]:
    return [e["action"] for e in client.get("/api/v1/audit", params={"limit": 500}).json()]


def test_adding_a_cluster_lists_it_and_gives_a_one_time_code(client: TestClient) -> None:
    created = add(client)
    assert created["cluster_id"] == "agent:edge"
    assert created["code"].startswith("kqi_")
    assert states(client) == {"edge": "waiting"}
    clusters = client.get("/api/v1/clusters", params={"all": "true", "check": "false"}).json()
    assert "agent:edge" in [c["id"] for c in clusters]
    assert client.post("/api/v1/agent/clusters", json={"name": "edge"}).status_code == 409
    assert client.post("/api/v1/agent/clusters", json={"name": "Bad Name"}).status_code == 422


def test_only_admins_manage_agents(client: TestClient) -> None:
    client.post("/api/v1/users", json={"username": "dev", "password": "dev-password"})
    browser = _sign_in(client, "dev", "dev-password")
    assert browser.get("/api/v1/agent/clusters").status_code == 403
    assert browser.post("/api/v1/agent/clusters", json={"name": "edge"}).status_code == 403
    add(client)
    assert browser.post("/api/v1/agent/clusters/edge/revoke").status_code == 403
    assert browser.post("/api/v1/agent/clusters/edge/code").status_code == 403
    assert browser.delete("/api/v1/agent/clusters/edge").status_code == 403
    assert _anonymous(client).get("/api/v1/agent/clusters").status_code == 401


def test_the_manifest_has_the_code_address_and_read_only_role(client: TestClient) -> None:
    code = add(client)["code"]
    anonymous = _anonymous(client)
    response = anonymous.get(
        "/api/v1/agent/install.yaml",
        params={"code": code},
        headers={"Host": "kubeiq.example.com"},
    )
    assert response.status_code == 200
    text = response.text
    assert f'code: "{code}"' in text
    assert 'value: "http://kubeiq.example.com"' in text
    assert f'image: "{service.image()}"' in text
    assert "name: kubeiq-readonly" in text and "kind: ClusterRole\n" in text
    assert "secrets" not in text.split("name: kubeiq-readonly\nrules:")[1]  # no Secrets read
    assert "kubeiq-agent-changes" not in text
    assert "kind: ServiceAccount\nmetadata:\n  name: kubeiq\n" not in text  # not connect.sh's

    custom = anonymous.get(
        "/api/v1/agent/install.yaml",
        params={"code": code, "url": "https://kubeiq.internal:8443", "changes": "true"},
    )
    assert 'value: "https://kubeiq.internal:8443"' in custom.text
    assert "name: kubeiq-agent-changes" in custom.text and "name: kubeiq-changes" in custom.text

    # The code is checked but not used up; addresses cannot inject YAML.
    injected = anonymous.get(
        "/api/v1/agent/install.yaml", params={"code": code, "url": 'https://x"\n  evil: 1'}
    )
    assert injected.status_code == 422
    bad = anonymous.get("/api/v1/agent/install.yaml", params={"code": "kqi_nope"})
    assert bad.status_code == 401
    assert "kind: Namespace" in anonymous.get("/api/v1/agent/uninstall.yaml").text


def test_a_code_registers_once(client: TestClient) -> None:
    code = add(client)["code"]
    first = register(client, code)
    assert first.status_code == 200
    assert first.json()["token"].startswith("kqa_") and first.json()["cluster"] == "edge"
    assert register(client, code).status_code == 401
    assert register(client, "kqi_guess").status_code == 401
    assert states(client) == {"edge": "offline"}
    # The code is used up, so the manifest is no longer served for it either.
    assert _anonymous(client).get("/api/v1/agent/install.yaml?code=" + code).status_code == 401


def test_expired_codes_do_not_register(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "CODE_TTL", timedelta(seconds=-1))
    code = add(client)["code"]
    assert register(client, code).status_code == 401


def connect(client: TestClient, token: str) -> Any:
    # The app's own client: the tunnel must live on the same event loop as the other requests.
    return client.websocket_connect(
        "/api/v1/agent/connect", headers={"Authorization": f"Bearer {token}"}
    )


def test_the_tunnel_needs_a_valid_token(client: TestClient) -> None:
    for token in ("kqa_guess", "nope", ""):
        with pytest.raises(WebSocketDisconnect), connect(client, token) as ws:
            ws.receive_bytes()


def test_a_connected_agent_shows_live_and_revoke_cuts_it_off(client: TestClient) -> None:
    code = add(client)["code"]
    token = register(client, code).json()["token"]
    with connect(client, token) as ws:
        ws.send_text('{"type":"hello","version":"0.4.0","kubernetes":"v1.31.0"}')
        ws.send_bytes(b"\x05\x00\x00\x00\x09\x00\x00\x00\x01")  # a late frame: ignored
        listed = client.get("/api/v1/agent/clusters").json()[0]
        assert listed["state"] == "connected"
        assert listed["agent_version"] == "0.4.0"
        assert listed["kubernetes_version"] == "v1.31.0"
        assert listed["connected_since"] is not None

        revoked = client.post("/api/v1/agent/clusters/edge/revoke")
        assert revoked.status_code == 200 and revoked.json()["state"] == "revoked"
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_bytes()
        assert closed.value.code == 4401
    assert get_hub().get("edge") is None
    with pytest.raises(WebSocketDisconnect), connect(client, token) as ws:
        ws.receive_bytes()

    # A new code installs it again, with a new token.
    again = client.post("/api/v1/agent/clusters/edge/code").json()["code"]
    assert register(client, again).status_code == 200
    assert states(client) == {"edge": "offline"}

    actions = audit_actions(client)
    for action in ("settings.agent.add", "settings.agent.register", "settings.agent.connect"):
        assert action in actions
    assert "settings.agent.revoke" in actions and "settings.agent.code" in actions


def test_removing_a_cluster_forgets_it(client: TestClient) -> None:
    code = add(client)["code"]
    register(client, code)
    assert client.delete("/api/v1/agent/clusters/edge").status_code == 204
    assert states(client) == {}
    listed = client.get("/api/v1/clusters", params={"all": "true", "check": "false"}).json()
    assert "agent:edge" not in [c["id"] for c in listed]
    assert client.delete("/api/v1/agent/clusters/edge").status_code == 404


def test_an_offline_agent_cluster_reports_why(client: TestClient) -> None:
    add(client)
    response = client.get("/api/v1/clusters/agent:edge")
    assert response.status_code == 200, response.text
    body = response.json()["status"]
    assert body["reachable"] is False
    assert "agent" in body["error"].lower()


def test_removing_every_cluster_removes_agent_clusters(client: TestClient) -> None:
    add(client)
    response = client.post(
        "/api/v1/settings/danger/remove-clusters", json={"confirm": "Remove clusters"}
    )
    assert response.status_code == 204
    assert states(client) == {}
