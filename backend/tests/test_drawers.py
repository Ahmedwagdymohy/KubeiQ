"""Edit YAML, create objects, drain, trigger, files and the terminal's origin check."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from kubeiq.products.manager import actions, edit, shell
from kubeiq.products.manager.models import Action, Kind
from kubeiq.products.manager.terminal import origin_allowed

DEPLOY = Kind(
    group="apps",
    version="v1",
    resource="deployments",
    kind="Deployment",
    label="Deployments",
    namespaced=True,
    verbs=["get", "update"],
)
SECRET = DEPLOY.model_copy(update={"group": "", "resource": "secrets", "kind": "Secret"})
YAML = """
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
  managedFields: [{}]
spec:
  replicas: 3
"""


def test_yaml_is_parsed_and_checked() -> None:
    obj = edit.parse(YAML)
    assert obj["kind"] == "Deployment" and edit.kind_of(obj, [DEPLOY]).resource == "deployments"
    for bad in [
        "a: [",
        "kind: X",
        "apiVersion: v1\nkind: Pod\nmetadata: {}",
        "---\na: 1\n---\nb: 2",
    ]:
        with pytest.raises(edit.EditError):
            edit.parse(bad)
    with pytest.raises(edit.EditError, match="does not serve"):
        edit.kind_of({"apiVersion": "x.io/v1", "kind": "Thing"}, [DEPLOY])


def test_apply_dry_runs_then_replaces(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str, Any]] = []

    def fake_request(
        _: Any, method: str, path: str, query: Any = None, body: Any = None, **__: Any
    ) -> Any:
        calls.append((method, path, query))
        return {**body, "status": {"replicas": 3}}

    monkeypatch.setattr(edit, "request", fake_request)
    result = edit.apply(None, DEPLOY, edit.parse(YAML), None, "web", dry_run=True)  # type: ignore[arg-type]
    assert calls[-1] == (
        "PUT",
        "/apis/apps/v1/namespaces/shop/deployments/web",
        [("dryRun", "All")],
    )
    assert "managedFields" not in result.yaml and result.dry_run and not result.created
    edit.apply(None, DEPLOY, edit.parse(YAML), None, None, dry_run=False)  # type: ignore[arg-type]
    assert calls[-1] == ("POST", "/apis/apps/v1/namespaces/shop/deployments", [])
    with pytest.raises(edit.EditError, match="name cannot change"):
        edit.apply(None, DEPLOY, edit.parse(YAML), None, "other", dry_run=True)  # type: ignore[arg-type]
    with pytest.raises(edit.EditError, match="Secrets"):
        edit.apply(None, SECRET, edit.parse(YAML), None, None, dry_run=True)  # type: ignore[arg-type]


def test_apply_needs_changes_on(client: TestClient) -> None:
    body = {"cluster_id": "upload:x/x", "yaml": YAML}
    assert client.post("/api/v1/manager/apply", json=body).status_code == 403
    client.put("/api/v1/settings/changes", json={"enabled": True})
    assert client.post("/api/v1/manager/apply", json={**body, "yaml": "a: ["}).status_code == 422


def test_drain_evicts_and_respects_budgets(monkeypatch: pytest.MonkeyPatch) -> None:
    from kubernetes.client.exceptions import ApiException

    pods = [
        {"metadata": {"name": "web", "namespace": "shop"}, "status": {"phase": "Running"}},
        {"metadata": {"name": "db", "namespace": "shop"}, "status": {"phase": "Running"}},
        {
            "metadata": {
                "name": "proxy",
                "namespace": "kube-system",
                "ownerReferences": [{"kind": "DaemonSet"}],
            },
            "status": {"phase": "Running"},
        },
        {
            "metadata": {
                "name": "etcd",
                "namespace": "kube-system",
                "annotations": {"kubernetes.io/config.mirror": "x"},
            },
            "status": {"phase": "Running"},
        },
    ]
    calls: list[tuple[str, str]] = []

    def fake_request(_: Any, method: str, path: str, **__: Any) -> Any:
        calls.append((method, path))
        if method == "GET":
            return {"items": pods}
        if path.endswith("/db/eviction"):
            raise ApiException(status=429)
        return {}

    monkeypatch.setattr(actions, "request", fake_request)
    message = actions.drain(None, "n1")  # type: ignore[arg-type]
    assert calls[0] == ("PATCH", "/api/v1/nodes/n1")
    assert ("POST", "/api/v1/namespaces/shop/pods/web/eviction") in calls
    assert not any("proxy" in p or "etcd" in p for _, p in calls)
    assert "evicted 1 pods" in message and "skipped 2" in message and "shop/db" in message


def test_trigger_creates_an_owned_job(monkeypatch: pytest.MonkeyPatch) -> None:
    created: list[Any] = []

    def fake_request(_: Any, method: str, path: str, body: Any = None, **__: Any) -> Any:
        if method == "GET":
            return {"metadata": {"uid": "u1"}, "spec": {"jobTemplate": {"spec": {"template": {}}}}}
        created.append((path, body))
        return {}

    monkeypatch.setattr(actions, "request", fake_request)
    action = Action(
        cluster_id="c",
        action="trigger",
        group="batch",
        version="v1",
        resource="cronjobs",
        namespace="shop",
        name="report",
    )
    actions.validate(action)
    assert actions.run(None, action).startswith("Started Job report-manual-")  # type: ignore[arg-type]
    path, job = created[0]
    assert path == "/apis/batch/v1/namespaces/shop/jobs"
    assert job["metadata"]["ownerReferences"][0]["uid"] == "u1"
    with pytest.raises(actions.UnsupportedActionError):
        actions.validate(action.model_copy(update={"resource": "deployments", "group": "apps"}))


def test_terminal_only_from_kubeiq_pages() -> None:
    assert origin_allowed("http://localhost:3000", "localhost:8000")  # the dev app origin
    assert origin_allowed("https://kubeiq.example.com", "kubeiq.example.com")
    assert not origin_allowed("https://evil.example", "kubeiq.example.com")
    assert not origin_allowed(None, "kubeiq.example.com")


def test_file_paths_are_absolute() -> None:
    assert shell.check_path("/app/logs") == "/app/logs"
    for bad in ["app", "/a/../etc", "/a\nb"]:
        with pytest.raises(shell.ShellError):
            shell.check_path(bad)
