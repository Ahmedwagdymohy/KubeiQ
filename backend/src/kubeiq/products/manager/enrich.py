"""Status-aware details for the main kinds, next to the server's own Table columns.

Pods get their real reason (CrashLoopBackOff, not "Running"), a state per container and usage
from metrics-server; workloads their strategy and images; nodes readiness, roles and usage.
"""

from typing import Any

from kubernetes.client import ApiClient

from kubeiq.products.manager.kube import request, resource_path
from kubeiq.usage.quantity import parse

ENRICHED = {
    ("", "pods"),
    ("apps", "deployments"),
    ("apps", "statefulsets"),
    ("apps", "daemonsets"),
    ("", "nodes"),
}
_DONE = {"Completed", "Succeeded"}
_BAD = (
    "Error",
    "BackOff",
    "Failed",
    "OOMKilled",
    "Evicted",
    "Unknown",
    "NotReady",
    "Err",
    "Invalid",
    "CreateContainerConfigError",
)


def tone(status: str) -> str:
    """ok, warning (Pending, ContainerCreating, Terminating), bad, done (Completed)."""
    if status in _DONE:
        return "done"
    if any(word in status for word in _BAD):
        return "bad"
    if status in ("Running", "Ready", "Active", "Bound"):
        return "ok"
    return "warning"


def _container(status: dict[str, Any]) -> dict[str, Any]:
    state: dict[str, Any] = status.get("state") or {}
    name, detail = next(iter(state.items()), ("waiting", None))
    detail = detail if isinstance(detail, dict) else {}
    return {
        "name": status.get("name", ""),
        "state": name,  # running, waiting, terminated
        "reason": detail.get("reason"),
        "ready": bool(status.get("ready")),
        "restarts": int(status.get("restartCount") or 0),
    }


def pod_status(pod: dict[str, Any]) -> str:
    """What kubectl shows in STATUS: the most telling container reason, else the phase."""
    meta = pod.get("metadata") or {}
    status = pod.get("status") or {}
    if meta.get("deletionTimestamp"):
        return "Terminating"
    if status.get("reason"):  # Evicted, NodeLost
        return str(status["reason"])
    for s in status.get("initContainerStatuses") or []:
        state = s.get("state") or {}
        if (state.get("terminated") or {}).get("exitCode", 0) != 0:
            return f"Init:{state['terminated'].get('reason') or 'Error'}"
        if (state.get("waiting") or {}).get("reason") not in (None, "PodInitializing"):
            return f"Init:{state['waiting']['reason']}"
    reason = None
    for s in status.get("containerStatuses") or []:
        state = s.get("state") or {}
        if state.get("waiting", {}).get("reason"):
            reason = state["waiting"]["reason"]
        elif state.get("terminated", {}).get("reason") and not reason:
            reason = state["terminated"]["reason"]
    return reason or status.get("phase") or "Unknown"


def _limits(pod: dict[str, Any], what: str) -> float:
    """Sum of container limits (else requests) for cpu or memory; 0 when none are set."""
    total = 0.0
    for c in (pod.get("spec") or {}).get("containers") or []:
        res = c.get("resources") or {}
        value = (res.get("limits") or {}).get(what) or (res.get("requests") or {}).get(what)
        if not value:
            return 0.0
        total += parse(value)
    return total


def pod_extra(
    pod: dict[str, Any], usage: dict[tuple[str, str], tuple[float, float]]
) -> dict[str, Any]:
    meta = pod.get("metadata") or {}
    status = pod.get("status") or {}
    containers = [_container(s) for s in status.get("containerStatuses") or []]
    if not containers:
        containers = [
            {
                "name": c.get("name", ""),
                "state": "waiting",
                "reason": None,
                "ready": False,
                "restarts": 0,
            }
            for c in (pod.get("spec") or {}).get("containers") or []
        ]
    text = pod_status(pod)
    used = usage.get((meta.get("namespace", ""), meta.get("name", "")))
    return {
        "status": text,
        "tone": tone(text),
        "containers": containers,
        "restarts": sum(c["restarts"] for c in containers),
        "node": (pod.get("spec") or {}).get("nodeName"),
        "ip": status.get("podIP"),
        "cpu": used[0] if used else None,
        "memory": used[1] if used else None,
        "cpu_limit": _limits(pod, "cpu") or None,
        "memory_limit": _limits(pod, "memory") or None,
        "owner": next(
            (f"{o.get('kind')}/{o.get('name')}" for o in meta.get("ownerReferences") or []), None
        ),
    }


def workload_extra(obj: dict[str, Any]) -> dict[str, Any]:
    spec = obj.get("spec") or {}
    status = obj.get("status") or {}
    template = (spec.get("template") or {}).get("spec") or {}
    strategy = spec.get("strategy") or spec.get("updateStrategy") or {}
    desired = spec.get("replicas", status.get("desiredNumberScheduled", 0)) or 0
    ready = status.get("readyReplicas", status.get("numberReady", 0)) or 0
    return {
        "strategy": strategy.get("type"),
        "images": [c.get("image", "") for c in template.get("containers") or []],
        "tone": "ok" if ready >= desired else ("bad" if ready == 0 and desired else "warning"),
    }


def node_extra(
    node: dict[str, Any], usage: dict[str, tuple[float, float]], pods: dict[str, int]
) -> dict[str, Any]:
    meta = node.get("metadata") or {}
    spec = node.get("spec") or {}
    status = node.get("status") or {}
    allocatable = status.get("allocatable") or {}
    ready = any(
        c.get("type") == "Ready" and c.get("status") == "True"
        for c in status.get("conditions") or []
    )
    prefix = "node-role.kubernetes.io/"
    name = meta.get("name", "")
    used = usage.get(name)
    return {
        "tone": "ok"
        if ready and not spec.get("unschedulable")
        else ("warning" if ready else "bad"),
        "ready": ready,
        "unschedulable": bool(spec.get("unschedulable")),
        "roles": sorted(
            k.removeprefix(prefix) for k in meta.get("labels") or {} if k.startswith(prefix)
        )
        or ["worker"],
        "taints": [f"{t.get('key')}:{t.get('effect')}" for t in spec.get("taints") or []],
        "cpu": used[0] if used else None,
        "cpu_capacity": parse(allocatable.get("cpu")),
        "memory": used[1] if used else None,
        "memory_capacity": parse(allocatable.get("memory")),
        "pods": pods.get(name, 0),
        "pods_capacity": parse(allocatable.get("pods")),
    }


def pod_usage(api: ApiClient, namespace: str | None) -> dict[tuple[str, str], tuple[float, float]]:
    """{(namespace, pod): (cores, bytes)} from metrics-server; empty when it is missing."""
    path = (
        f"/apis/metrics.k8s.io/v1beta1/namespaces/{namespace}/pods"
        if namespace
        else "/apis/metrics.k8s.io/v1beta1/pods"
    )
    if namespace:
        resource_path("", "v1", "pods", namespace)  # validates the namespace
    try:
        body = request(api, "GET", path)
    except Exception:
        return {}
    usage = {}
    for item in body.get("items") or []:
        meta = item.get("metadata") or {}
        cores = sum(parse((c.get("usage") or {}).get("cpu")) for c in item.get("containers") or [])
        memory = sum(
            parse((c.get("usage") or {}).get("memory")) for c in item.get("containers") or []
        )
        usage[(meta.get("namespace", ""), meta.get("name", ""))] = (cores, memory)
    return usage


def node_usage(api: ApiClient) -> dict[str, tuple[float, float]]:
    try:
        body = request(api, "GET", "/apis/metrics.k8s.io/v1beta1/nodes")
    except Exception:
        return {}
    return {
        (item.get("metadata") or {}).get("name", ""): (
            parse((item.get("usage") or {}).get("cpu")),
            parse((item.get("usage") or {}).get("memory")),
        )
        for item in body.get("items") or []
    }


def pods_per_node(api: ApiClient) -> dict[str, int]:
    try:
        body = request(
            api,
            "GET",
            "/api/v1/pods",
            query=[("fieldSelector", "status.phase=Running"), ("limit", 5000)],
        )
    except Exception:
        return {}
    counts: dict[str, int] = {}
    for item in body.get("items") or []:
        node = (item.get("spec") or {}).get("nodeName")
        if node:
            counts[node] = counts.get(node, 0) + 1
    return counts


def extras(
    api: ApiClient, group: str, resource: str, namespace: str | None, objects: list[dict[str, Any]]
) -> list[dict[str, Any] | None]:
    """One details dict per object (in order), or None for kinds without them."""
    key = (group, resource)
    if key not in ENRICHED:
        return [None] * len(objects)
    if key == ("", "pods"):
        usage = pod_usage(api, namespace)
        return [pod_extra(o, usage) for o in objects]
    if key == ("", "nodes"):
        n_usage, pods = node_usage(api), pods_per_node(api)
        return [node_extra(o, n_usage, pods) for o in objects]
    return [workload_extra(o) for o in objects]
