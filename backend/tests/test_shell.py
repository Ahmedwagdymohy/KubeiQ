"""App shell: per-user preferences, the status bar summary and resource search."""

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from kubeiq.clusters.base import ClusterStatus
from kubeiq.products.manager import resources
from kubeiq.usage import summary
from kubeiq.usage.quantity import parse


def test_preferences_are_saved_per_user(client: TestClient) -> None:
    assert client.get("/api/v1/me/preferences").json() == {}
    assert client.put("/api/v1/me/preferences/pinned", json=["/map"]).status_code == 204
    assert client.put("/api/v1/me/preferences/sidebar", json={"collapsed": True}).status_code == 204
    assert client.get("/api/v1/me/preferences").json() == {
        "pinned": ["/map"],
        "sidebar": {"collapsed": True},
    }
    client.put("/api/v1/me/preferences/pinned", json=["/doctor", "/map"])
    assert client.get("/api/v1/me/preferences").json()["pinned"] == ["/doctor", "/map"]
    assert client.delete("/api/v1/me/preferences/pinned").status_code == 204
    assert "pinned" not in client.get("/api/v1/me/preferences").json()


def test_preferences_are_bounded(client: TestClient) -> None:
    assert client.put("/api/v1/me/preferences/Bad Key", json=1).status_code == 422
    big = client.put("/api/v1/me/preferences/big", json="x" * 20_000)
    assert big.status_code == 413


def test_preferences_need_sign_in(client: TestClient) -> None:
    response = client.get("/api/v1/me/preferences", headers={"Authorization": ""})
    assert response.status_code == 401


def test_quantities() -> None:
    assert parse("250m") == 0.25
    assert parse("2") == 2
    assert parse("1Gi") == 2**30
    assert parse("128974848") == 128974848
    assert parse("123456Ki") == 123456 * 1024
    assert parse("500000000n") == 0.5
    assert parse("garbage") == 0
    assert parse(None) == 0


def test_node_health_follows_readiness() -> None:
    assert summary.node_health(3, 3) == "healthy"
    assert summary.node_health(4, 2) == "degraded"
    assert summary.node_health(3, 1) == "unhealthy"


def test_status_comes_before_nodes() -> None:
    assert summary.status_health(ClusterStatus(reachable=False)) == "offline"
    assert summary.status_health(ClusterStatus(reachable=True, can_read=False)) == "no-access"
    assert summary.status_health(ClusterStatus(reachable=False, can_read=False)) == "no-access"
    assert summary.status_health(ClusterStatus(reachable=True, can_read=True)) is None
    unreachable = summary.summarize(None, ClusterStatus(reachable=False, error="timed out"))  # type: ignore[arg-type]
    assert unreachable.health == "offline" and unreachable.reason == "timed out"


def _node(name: str, ready: bool) -> Any:
    return SimpleNamespace(
        metadata=SimpleNamespace(name=name, labels={"node-role.kubernetes.io/control-plane": ""}),
        spec=SimpleNamespace(unschedulable=False, taints=[]),
        status=SimpleNamespace(
            conditions=[SimpleNamespace(type="Ready", status="True" if ready else "False")],
            allocatable={"cpu": "4", "memory": "8Gi", "pods": "110"},
        ),
    )


def _pod(node: str, phase: str) -> Any:
    return SimpleNamespace(
        spec=SimpleNamespace(node_name=node), status=SimpleNamespace(phase=phase)
    )


def test_summary_counts_nodes_pods_and_usage(monkeypatch: pytest.MonkeyPatch) -> None:
    class Core:
        def __init__(self, _: Any) -> None:
            pass

        def list_node(self, **_: Any) -> Any:
            return SimpleNamespace(items=[_node("a", True), _node("b", False)])

        def list_pod_for_all_namespaces(self, **_: Any) -> Any:
            return SimpleNamespace(items=[_pod("a", "Running"), _pod("a", "Pending")])

        def list_namespace(self, **_: Any) -> Any:
            return SimpleNamespace(items=[1, 2, 3])

    monkeypatch.setattr(summary, "CoreV1Api", Core)
    monkeypatch.setattr(summary, "node_metrics", lambda _: {"a": (1.0, 2**30), "b": (1.0, 2**30)})
    result = summary.summarize(None, ClusterStatus(reachable=True, version="v1.31", can_read=True))  # type: ignore[arg-type]
    assert result.health == "degraded"
    assert (result.nodes, result.nodes_ready, result.namespaces) == (2, 1, 3)
    assert (result.pods_running, result.pods) == (1, 2)
    assert result.cpu is not None and result.cpu.used == 2 and result.cpu.capacity == 8
    assert result.cpu.percent == 25
    assert result.metrics


def test_summary_without_metrics_server_has_no_numbers(monkeypatch: pytest.MonkeyPatch) -> None:
    def missing(_: Any) -> Any:
        raise RuntimeError("404")

    class Core:
        def __init__(self, _: Any) -> None:
            pass

        def list_node(self, **_: Any) -> Any:
            return SimpleNamespace(items=[_node("a", True)])

        def list_pod_for_all_namespaces(self, **_: Any) -> Any:
            return SimpleNamespace(items=[])

        def list_namespace(self, **_: Any) -> Any:
            return SimpleNamespace(items=[])

    monkeypatch.setattr(summary, "CoreV1Api", Core)
    monkeypatch.setattr(summary, "node_metrics", missing)
    result = summary.summarize(None, ClusterStatus(reachable=True, can_read=True))  # type: ignore[arg-type]
    assert result.health == "healthy"
    assert result.cpu is None and result.memory is None
    assert not result.metrics and result.metrics_error == summary.METRICS_MISSING


def test_search_finds_names_prefix_first(monkeypatch: pytest.MonkeyPatch) -> None:
    lists = {
        "/apis/apps/v1/deployments": [("shop", "checkout"), ("shop", "payment-api")],
        "/api/v1/pods": [("shop", "payment-api-7d9-x2"), ("shop", "web-1")],
        "/api/v1/services": [("shop", "payment")],
    }

    def fake_request(_: Any, method: str, path: str, **__: Any) -> Any:
        if path not in lists:
            raise RuntimeError("forbidden")
        items = [{"metadata": {"namespace": ns, "name": n}} for ns, n in lists[path]]
        return {"items": items}

    monkeypatch.setattr(resources, "request", fake_request)
    resources._names.clear()
    hits = resources.search("c1", None, "pay", None)  # type: ignore[arg-type]
    assert [(h.kind, h.name) for h in hits] == [
        ("Service", "payment"),
        ("Deployment", "payment-api"),
        ("Pod", "payment-api-7d9-x2"),
    ]
    assert resources.search("c1", None, "  ", None) == []  # type: ignore[arg-type]


def test_search_stays_inside_allowed_namespaces(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    def fake_request(_: Any, method: str, path: str, **__: Any) -> Any:
        seen.append(path)
        return {"items": []}

    monkeypatch.setattr(resources, "request", fake_request)
    resources._names.clear()
    resources.search("c2", None, "x", ["shop"])  # type: ignore[arg-type]
    assert seen and all("/namespaces/shop/" in p for p in seen)
