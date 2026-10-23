"""Cluster Manager: discovery, Secret safety, path validation and opt-in changes."""

import pytest
from fastapi.testclient import TestClient

from kubeiq.products.manager import actions
from kubeiq.products.manager.discovery import _kinds, categorize, label
from kubeiq.products.manager.kube import InvalidPathError, resource_path
from kubeiq.products.manager.models import Action
from kubeiq.products.manager.resources import clean
from tests.test_settings import KUBECONFIG

CORE = {
    "resources": [
        {"name": "pods", "kind": "Pod", "namespaced": True, "verbs": ["get", "list"]},
        {"name": "pods/log", "kind": "Pod", "namespaced": True, "verbs": ["get"]},
        {"name": "secrets", "kind": "Secret", "namespaced": True, "verbs": ["get", "list"]},
        {"name": "nodes", "kind": "Node", "namespaced": False, "verbs": ["get", "list"]},
        {"name": "endpoints", "kind": "Endpoints", "namespaced": True, "verbs": ["list"]},
        {"name": "bindings", "kind": "Binding", "namespaced": True, "verbs": ["create"]},
    ]
}
CRD = {
    "resources": [
        {"name": "certificates", "kind": "Certificate", "namespaced": True, "verbs": ["list"]},
    ]
}


def test_discovery_groups_kinds_into_categories() -> None:
    kinds = _kinds("", "v1", CORE) + _kinds("cert-manager.io", "v1", CRD)
    assert [k.resource for k in kinds] == ["pods", "secrets", "nodes", "certificates"]
    categories = {c.name: [k.resource for k in c.kinds] for c in categorize(kinds)}
    assert categories == {
        "Workloads": ["pods"],
        "Config": ["secrets"],
        "Cluster": ["nodes"],
        "Custom Resources": ["certificates"],
    }


def test_labels_are_plural_and_spaced() -> None:
    assert label("PersistentVolumeClaim") == "Persistent Volume Claims"
    assert label("Ingress") == "Ingresses"
    assert label("NetworkPolicy") == "Network Policies"


def test_secret_values_and_applied_config_are_dropped() -> None:
    secret = {
        "metadata": {
            "name": "db",
            "managedFields": [{}],
            "annotations": {"kubectl.kubernetes.io/last-applied-configuration": "{password}"},
        },
        "data": {"password": "c2VjcmV0"},
        "stringData": {"token": "x"},
    }
    cleaned = clean(secret, secret=True)
    assert "data" not in cleaned and "stringData" not in cleaned
    assert cleaned["metadata"] == {"name": "db", "annotations": {}}


def test_paths_are_validated() -> None:
    assert resource_path("apps", "v1", "deployments", "shop", "web") == (
        "/apis/apps/v1/namespaces/shop/deployments/web"
    )
    assert resource_path("", "v1", "nodes") == "/api/v1/nodes"
    for bad in [("", "v1", "pods/../secrets"), ("a/b", "v1", "pods"), ("", "1", "pods")]:
        with pytest.raises(InvalidPathError):
            resource_path(*bad)
    with pytest.raises(InvalidPathError):
        resource_path("", "v1", "pods", "shop", "../x")


def test_actions_only_apply_to_fitting_kinds() -> None:
    base = {"cluster_id": "c", "version": "v1", "name": "x", "namespace": "shop"}
    with pytest.raises(actions.UnsupportedActionError):
        actions.validate(Action(action="scale", resource="pods", replicas=2, **base))
    with pytest.raises(actions.UnsupportedActionError):
        actions.validate(Action(action="scale", group="apps", resource="deployments", **base))
    with pytest.raises(actions.UnsupportedActionError):
        actions.validate(Action(action="cordon", resource="pods", **base))
    actions.validate(Action(action="restart", group="apps", resource="deployments", **base))


def test_changes_are_off_until_an_admin_turns_them_on(client: TestClient) -> None:
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})
    body = {
        "cluster_id": "upload:staging/staging",
        "action": "restart",
        "group": "apps",
        "version": "v1",
        "resource": "deployments",
        "namespace": "shop",
        "name": "web",
    }
    off = client.post("/api/v1/manager/actions", json=body)
    assert off.status_code == 403
    assert "turned off" in off.json()["detail"]

    assert client.put("/api/v1/settings/changes", json={"enabled": True}).json()["enabled"]
    user = client.post("/api/v1/users", json={"username": "viewer", "password": "viewer-pass"})
    client.post(
        "/api/v1/projects",
        json={
            "name": "Shop",
            "scopes": [{"cluster_id": "upload:staging/staging", "namespaces": ["shop"]}],
            "members": [{"user_id": user.json()["id"], "role": "viewer"}],
        },
    )
    viewer = TestClient(client.app)
    viewer.post("/api/v1/auth/login", json={"username": "viewer", "password": "viewer-pass"})
    assert viewer.post("/api/v1/manager/actions", json=body).status_code == 403
    assert viewer.get("/api/v1/auth/me").json()["changes_enabled"] is True

    actions_logged = [e["action"] for e in client.get("/api/v1/audit").json()]
    assert "settings.changes" in actions_logged
