"""Opt-in cluster changes: scale, restart, delete, cordon and uncordon (ADR 0009)."""

from datetime import UTC, datetime

from kubernetes.client import ApiClient

from kubeiq.products.manager.kube import request, resource_path
from kubeiq.products.manager.models import Action

SCALABLE = {("apps", "deployments"), ("apps", "statefulsets"), ("apps", "replicasets")}
RESTARTABLE = {("apps", "deployments"), ("apps", "statefulsets"), ("apps", "daemonsets")}
MERGE = "application/merge-patch+json"
STRATEGIC = "application/strategic-merge-patch+json"


class UnsupportedActionError(ValueError):
    pass


def validate(action: Action) -> None:
    key = (action.group, action.resource)
    if action.action == "scale":
        if key not in SCALABLE:
            raise UnsupportedActionError("Only Deployments, StatefulSets and ReplicaSets can scale")
        if action.replicas is None:
            raise UnsupportedActionError("Choose how many replicas to run")
    if action.action == "restart" and key not in RESTARTABLE:
        raise UnsupportedActionError("Only Deployments, StatefulSets and DaemonSets can restart")
    if action.action in {"cordon", "uncordon"} and key != ("", "nodes"):
        raise UnsupportedActionError("Only nodes can be cordoned")


def describe(action: Action) -> str:
    if action.action == "scale":
        return f"to {action.replicas} replicas"
    return ""


def run(api: ApiClient, action: Action) -> str:
    """Apply the change and return a short message for the user."""
    validate(action)
    path = resource_path(
        action.group, action.version, action.resource, action.namespace, action.name
    )
    if action.action == "scale":
        replicas = {"spec": {"replicas": action.replicas}}
        request(api, "PATCH", path + "/scale", body=replicas, content_type=MERGE)
        return f"Scaled {action.name} to {action.replicas} replicas"
    if action.action == "restart":
        stamp = datetime.now(UTC).isoformat(timespec="seconds")
        annotations = {"kubectl.kubernetes.io/restartedAt": stamp}
        body = {"spec": {"template": {"metadata": {"annotations": annotations}}}}
        request(api, "PATCH", path, body=body, content_type=STRATEGIC)
        return f"Restarting {action.name}. Pods are replaced one by one"
    if action.action == "delete":
        request(api, "DELETE", path, body={"propagationPolicy": "Background"})
        return f"Deleted {action.name}"
    unschedulable = action.action == "cordon"
    request(api, "PATCH", path, body={"spec": {"unschedulable": unschedulable}}, content_type=MERGE)
    return f"{'Cordoned' if unschedulable else 'Uncordoned'} {action.name}"
