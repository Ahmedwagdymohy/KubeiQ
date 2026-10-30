"""Opt-in cluster changes (ADR 0009): scale, restart, delete, cordon, uncordon, drain,
trigger, suspend and resume."""

from datetime import UTC, datetime
from typing import Any

from kubernetes.client import ApiClient
from kubernetes.client.exceptions import ApiException

from kubeiq.products.manager.kube import request, resource_path
from kubeiq.products.manager.models import Action

SCALABLE = {("apps", "deployments"), ("apps", "statefulsets"), ("apps", "replicasets")}
RESTARTABLE = {("apps", "deployments"), ("apps", "statefulsets"), ("apps", "daemonsets")}
SUSPENDABLE = {("batch", "cronjobs"), ("batch", "jobs")}
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
    if action.action in {"cordon", "uncordon", "drain"} and key != ("", "nodes"):
        raise UnsupportedActionError("Only nodes can be cordoned or drained")
    if action.action == "trigger" and key != ("batch", "cronjobs"):
        raise UnsupportedActionError("Only CronJobs can be triggered")
    if action.action in {"suspend", "resume"} and key not in SUSPENDABLE:
        raise UnsupportedActionError("Only CronJobs and Jobs can be suspended")


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
    if action.action == "trigger":
        return trigger(api, action)
    if action.action in {"suspend", "resume"}:
        suspend = action.action == "suspend"
        request(api, "PATCH", path, body={"spec": {"suspend": suspend}}, content_type=MERGE)
        return f"{'Suspended' if suspend else 'Resumed'} {action.name}"
    if action.action == "drain":
        return drain(api, action.name)
    unschedulable = action.action == "cordon"
    request(api, "PATCH", path, body={"spec": {"unschedulable": unschedulable}}, content_type=MERGE)
    return f"{'Cordoned' if unschedulable else 'Uncordoned'} {action.name}"


def trigger(api: ApiClient, action: Action) -> str:
    """Run a CronJob now: a Job from its template, owned by it, like kubectl create job --from."""
    path = resource_path("batch", "v1", "cronjobs", action.namespace, action.name)
    cronjob = request(api, "GET", path)
    stamp = datetime.now(UTC).strftime("%m%d%H%M%S")
    name = f"{action.name[: 63 - len(stamp) - 8]}-manual-{stamp}"
    template = (cronjob.get("spec") or {}).get("jobTemplate") or {}
    job = {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {
            "name": name,
            "namespace": action.namespace,
            "labels": (template.get("metadata") or {}).get("labels") or {},
            "annotations": {"cronjob.kubernetes.io/instantiate": "manual"},
            "ownerReferences": [
                {
                    "apiVersion": "batch/v1",
                    "kind": "CronJob",
                    "name": action.name,
                    "uid": cronjob["metadata"]["uid"],
                    "controller": True,
                }
            ],
        },
        "spec": template.get("spec") or {},
    }
    request(api, "POST", resource_path("batch", "v1", "jobs", action.namespace), body=job)
    return f"Started Job {name}"


def _evictable(pod: dict[str, Any]) -> bool:
    meta = pod.get("metadata") or {}
    if "kubernetes.io/config.mirror" in (meta.get("annotations") or {}):
        return False  # static pods are managed by the kubelet
    if any(o.get("kind") == "DaemonSet" for o in meta.get("ownerReferences") or []):
        return False  # they would come straight back
    phase = (pod.get("status") or {}).get("phase")
    return phase not in ("Succeeded", "Failed")


def drain(api: ApiClient, node: str) -> str:
    """Cordon, then evict the node's pods through the eviction API, which respects disruption
    budgets. DaemonSet and static pods are skipped."""
    node_path = resource_path("", "v1", "nodes", None, node)
    request(api, "PATCH", node_path, body={"spec": {"unschedulable": True}}, content_type=MERGE)
    pods = (
        request(api, "GET", "/api/v1/pods", query=[("fieldSelector", f"spec.nodeName={node}")]).get(
            "items"
        )
        or []
    )
    evicted, skipped, blocked = 0, 0, []
    for pod in pods:
        meta = pod.get("metadata") or {}
        if not _evictable(pod):
            skipped += 1
            continue
        eviction = {
            "apiVersion": "policy/v1",
            "kind": "Eviction",
            "metadata": {"name": meta["name"], "namespace": meta["namespace"]},
        }
        path = resource_path("", "v1", "pods", meta["namespace"], meta["name"]) + "/eviction"
        try:
            request(api, "POST", path, body=eviction)
            evicted += 1
        except ApiException as exc:
            if exc.status == 429:  # a disruption budget does not allow it now
                blocked.append(f"{meta['namespace']}/{meta['name']}")
            elif exc.status != 404:
                raise
    message = (
        f"Cordoned {node} and evicted {evicted} pods; skipped {skipped} DaemonSet or static pods"
    )
    if blocked:
        message += f". A disruption budget kept {len(blocked)}: {', '.join(blocked[:5])}"
    return message
