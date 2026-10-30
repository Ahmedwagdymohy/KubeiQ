"""Notifications: channels keep secrets write-only, rules route alerts, the engine sends an alert
once, again after the cooldown, and once resolved. Plus the activity search and viewer limits."""

import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from kubeiq.clusters.base import ClusterInfo, ClusterStatus, ConnectionMethod
from kubeiq.notifications import channels, engine, service
from kubeiq.notifications.models import Alert, ClusterAlerts, Rules
from tests.test_settings import KUBECONFIG

SLACK = {
    "name": "Ops",
    "type": "slack",
    "config": {"url": "https://hooks.slack.com/services/T/B/secret"},
}


def test_channel_secrets_are_write_only(client: TestClient) -> None:
    saved = client.post("/api/v1/settings/notifications/channels", json=SLACK).json()
    channel = saved["channels"][0]
    assert channel["config"] == {} and channel["secrets"] == ["url"]
    assert "hooks.slack.com" not in json.dumps(client.get("/api/v1/settings/notifications").json())
    renamed = client.post(
        "/api/v1/settings/notifications/channels",
        json={**SLACK, "id": channel["id"], "name": "Ops team", "config": {}},
    ).json()["channels"][0]
    assert renamed["name"] == "Ops team" and renamed["secrets"] == ["url"]  # kept
    missing = client.post(
        "/api/v1/settings/notifications/channels",
        json={"name": "x", "type": "telegram", "config": {"token": "t"}},
    )
    assert missing.status_code == 422 and "chat_id" in missing.json()["detail"]
    after = client.delete(f"/api/v1/settings/notifications/channels/{channel['id']}").json()
    assert after["channels"] == []


def test_quiet_hours() -> None:
    at = lambda h: datetime(2026, 10, 30, h, 30, tzinfo=UTC)  # noqa: E731
    night = Rules(quiet_start=22, quiet_end=6)
    assert (
        service.quiet(night, at(23))
        and service.quiet(night, at(3))
        and not service.quiet(night, at(12))
    )
    assert not service.quiet(Rules(), at(3))


def test_rules_and_cluster_routing() -> None:
    doc = {
        "channels": [
            {"id": "a", "enabled": True},
            {"id": "b", "enabled": True},
            {"id": "c", "enabled": False},
        ],
        "rules": {},
    }
    alert = Alert(
        key="k", rule="workload.failing", cluster_id="c1", cluster="c1", title="t", text=""
    )
    assert [c["id"] for c in service.targets(doc, alert, None)] == ["a", "b"]

    class Row:
        alerts = ClusterAlerts(channels=["b"], events=None).model_dump()

    assert [c["id"] for c in service.targets(doc, alert, Row())] == ["b"]  # type: ignore[arg-type]
    Row.alerts = ClusterAlerts(events=["node.not_ready"]).model_dump()
    assert service.targets(doc, alert, Row()) == []  # type: ignore[arg-type]
    off = alert.model_copy(update={"rule": "event.reason"})  # not enabled by default
    assert service.targets(doc, off, None) == []


class Registry:
    def __init__(self) -> None:
        self.reachable = False

    def list_clusters(self) -> list[ClusterInfo]:
        return [
            ClusterInfo(id="upload:staging/staging", name="staging", method=ConnectionMethod.UPLOAD)
        ]

    async def check(self, cluster_id: str) -> ClusterStatus:
        return ClusterStatus(
            reachable=self.reachable, error=None if self.reachable else "Timed out"
        )

    def api_client(self, cluster_id: str) -> Any:
        return None


def test_engine_sends_once_then_resolves(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})
    client.post(
        "/api/v1/projects",
        json={
            "name": "Shop",
            "scopes": [{"cluster_id": "upload:staging/staging", "namespaces": []}],
            "members": [],
        },
    )
    client.post("/api/v1/settings/notifications/channels", json=SLACK)
    sent: list[Alert] = []

    def fake_send(kind: str, config: dict[str, Any], alert: Alert) -> None:
        assert config["url"].startswith("https://hooks.slack.com")  # decrypted for sending
        sent.append(alert)

    monkeypatch.setattr(channels, "send", fake_send)
    monkeypatch.setattr(engine, "observe", lambda *a: [])
    monkeypatch.setattr(engine, "STATE", engine.State())
    registry = Registry()
    now = datetime(2026, 10, 30, 12, tzinfo=UTC)

    asyncio.run(engine.evaluate(registry, now))  # type: ignore[arg-type]
    assert [a.title for a in sent] == ["staging is unreachable"]
    asyncio.run(engine.evaluate(registry, now + timedelta(minutes=10)))  # type: ignore[arg-type]
    assert len(sent) == 1  # still down, inside the cooldown
    asyncio.run(engine.evaluate(registry, now + timedelta(minutes=61)))  # type: ignore[arg-type]
    assert len(sent) == 2  # reminded after the cooldown
    registry.reachable = True
    asyncio.run(engine.evaluate(registry, now + timedelta(minutes=62)))  # type: ignore[arg-type]
    assert sent[-1].resolved and sent[-1].title.startswith("Resolved:")


def test_message_formats(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(channels.SendError):
        channels._post("file:///etc/passwd", {})
    posted: list[tuple[str, dict[str, Any], dict[str, str] | None]] = []
    monkeypatch.setattr(
        channels, "_post", lambda url, payload, headers=None: posted.append((url, payload, headers))
    )
    alert = Alert(
        key="k",
        rule="workload.failing",
        cluster_id="c",
        cluster="c",
        title="web is failing",
        text="CrashLoopBackOff",
        link="https://kq/doctor",
    )
    channels.send("slack", {"url": "https://hooks.slack.com/x"}, alert)
    assert posted[-1][1]["blocks"][1]["elements"][0]["url"] == "https://kq/doctor"
    channels.send("telegram", {"token": "123:abc", "chat_id": "42"}, alert)
    assert posted[-1][0] == "https://api.telegram.org/bot123:abc/sendMessage"
    channels.send("webhook", {"url": "https://example.com/hook", "secret": "s3"}, alert)
    assert posted[-1][2] and posted[-1][2]["X-KubeiQ-Signature"].startswith("sha256=")


def test_activity_search_filters_and_pages(client: TestClient) -> None:
    client.put("/api/v1/settings/changes", json={"enabled": True})
    client.put("/api/v1/settings/changes", json={"enabled": False})
    page = client.get("/api/v1/audit/search", params={"action": "settings.", "limit": 1}).json()
    assert page["total"] == 2 and len(page["items"]) == 1
    assert (
        client.get("/api/v1/audit/search", params={"q": "nothing-like-this"}).json()["total"] == 0
    )


def test_viewers_cannot_change_anything(client: TestClient) -> None:
    client.put("/api/v1/settings/changes", json={"enabled": True})
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})
    user = client.post(
        "/api/v1/users", json={"username": "viewer", "password": "viewer-pass"}
    ).json()
    cluster = "upload:staging/staging"
    client.post(
        "/api/v1/projects",
        json={
            "name": "Shop",
            "scopes": [{"cluster_id": cluster, "namespaces": []}],
            "members": [{"user_id": user["id"], "role": "viewer"}],
        },
    )
    viewer = TestClient(client.app)
    viewer.post("/api/v1/auth/login", json={"username": "viewer", "password": "viewer-pass"})
    ref = {
        "cluster_id": cluster,
        "group": "apps",
        "version": "v1",
        "resource": "deployments",
        "namespace": "shop",
        "name": "web",
    }
    for action in ["scale", "restart", "delete", "drain", "trigger", "suspend"]:
        assert (
            viewer.post(
                "/api/v1/manager/actions", json={**ref, "action": action, "replicas": 1}
            ).status_code
            == 403
        )
    yaml = "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: x\n  namespace: shop\n"
    assert (
        viewer.post("/api/v1/manager/apply", json={"cluster_id": cluster, "yaml": yaml}).status_code
        == 403
    )
    files = {"cluster_id": cluster, "namespace": "shop", "pod": "p", "container": "c"}
    assert viewer.get("/api/v1/manager/files", params=files).status_code == 403
    assert (
        viewer.get(
            "/api/v1/manager/files/download", params={**files, "path": "/etc/hosts"}
        ).status_code
        == 403
    )
    assert viewer.get("/api/v1/settings/notifications").status_code == 403
    assert viewer.get("/api/v1/audit/search").status_code == 403
