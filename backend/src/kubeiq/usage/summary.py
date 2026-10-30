"""What the status bar and dashboard show for a cluster: nodes, namespaces and usage.

Usage comes from metrics-server (``metrics.k8s.io``). Without it the numbers are absent, never
zero or guessed.
"""

from typing import Any, Literal, cast

from kubernetes.client import ApiClient, CoreV1Api, CustomObjectsApi
from kubernetes.client.exceptions import ApiException
from pydantic import BaseModel

from kubeiq.clusters.base import ClusterStatus
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.usage.quantity import parse

Health = Literal["healthy", "degraded", "unhealthy", "no-access", "offline"]
METRICS_MISSING = "Usage needs metrics-server"
METRICS_INSTALL = (
    "kubectl apply -f "
    "https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml"
)


class Gauge(BaseModel):
    used: float
    capacity: float  # allocatable: what pods can actually use

    @property
    def percent(self) -> float:
        return round(100 * self.used / self.capacity, 1) if self.capacity else 0.0


class NodeInfo(BaseModel):
    name: str
    ready: bool
    unschedulable: bool
    roles: list[str]
    taints: list[str]
    cpu: Gauge | None = None
    memory: Gauge | None = None
    pods: Gauge | None = None  # running pods of allocatable pods


class ClusterSummary(BaseModel):
    health: Health
    reason: str | None = None
    version: str | None = None
    nodes: int | None = None
    nodes_ready: int | None = None
    namespaces: int | None = None
    pods: int | None = None
    pods_running: int | None = None
    cpu: Gauge | None = None
    memory: Gauge | None = None
    metrics: bool = False
    metrics_error: str | None = None


def node_health(total: int, ready: int) -> Health:
    """All nodes Ready: healthy; at least half: degraded; fewer: unhealthy."""
    if total == 0 or ready == total:
        return "healthy"
    return "degraded" if ready * 2 >= total else "unhealthy"


def status_health(status: ClusterStatus) -> Health | None:
    if not status.reachable:
        return "offline" if status.can_read is not False else "no-access"
    if status.can_read is False:
        return "no-access"
    return None


def _ready(node: Any) -> bool:
    return any(c.type == "Ready" and c.status == "True" for c in (node.status.conditions or []))


def _roles(labels: dict[str, str]) -> list[str]:
    prefix = "node-role.kubernetes.io/"
    return sorted(k.removeprefix(prefix) for k in labels if k.startswith(prefix)) or ["worker"]


def node_metrics(api: ApiClient) -> dict[str, tuple[float, float]]:
    """{node: (cores, bytes)} from metrics-server. Raises ApiException when it is missing."""
    body = cast(
        dict[str, Any],
        CustomObjectsApi(api).list_cluster_custom_object(
            "metrics.k8s.io", "v1beta1", "nodes", _request_timeout=REQUEST_TIMEOUT
        ),
    )
    return {
        item["metadata"]["name"]: (
            parse((item.get("usage") or {}).get("cpu")),
            parse((item.get("usage") or {}).get("memory")),
        )
        for item in body.get("items") or []
    }


def metrics_error(exc: Exception) -> str:
    if isinstance(exc, ApiException) and exc.status in (401, 403):
        return "KubeiQ may not read metrics. Apply the latest read-only role to show usage"
    return METRICS_MISSING


def nodes(
    api: ApiClient, with_metrics: bool = True
) -> tuple[list[NodeInfo], str | None, tuple[int, int]]:
    """Every node with its state and usage, why usage is missing (None when present), and
    (running, total) pods."""
    core = CoreV1Api(api)
    items: list[Any] = core.list_node(_request_timeout=REQUEST_TIMEOUT).items
    pods: list[Any] = core.list_pod_for_all_namespaces(_request_timeout=REQUEST_TIMEOUT).items
    running = [p for p in pods if p.status and p.status.phase == "Running"]
    per_node: dict[str, int] = {}
    for pod in running:
        if pod.spec and pod.spec.node_name:
            per_node[pod.spec.node_name] = per_node.get(pod.spec.node_name, 0) + 1
    usage: dict[str, tuple[float, float]] = {}
    error = None
    if with_metrics:
        try:
            usage = node_metrics(api)
        except Exception as exc:
            error = metrics_error(exc)
    result = []
    for node in items:
        name = node.metadata.name
        allocatable = node.status.allocatable or {}
        info = NodeInfo(
            name=name,
            ready=_ready(node),
            unschedulable=bool(node.spec.unschedulable),
            roles=_roles(node.metadata.labels or {}),
            taints=[f"{t.key}:{t.effect}" for t in (node.spec.taints or [])],
            pods=Gauge(used=per_node.get(name, 0), capacity=parse(allocatable.get("pods"))),
        )
        if name in usage:
            info.cpu = Gauge(used=usage[name][0], capacity=parse(allocatable.get("cpu")))
            info.memory = Gauge(used=usage[name][1], capacity=parse(allocatable.get("memory")))
        result.append(info)
    return result, error, (len(running), len(pods))


def summarize(api: ApiClient, status: ClusterStatus) -> ClusterSummary:
    """Status first (offline, no access), then node readiness, then usage."""
    broken = status_health(status)
    if broken:
        return ClusterSummary(health=broken, reason=status.error, version=status.version)
    node_list, error, (running, total) = nodes(api)
    namespaces = CoreV1Api(api).list_namespace(_request_timeout=REQUEST_TIMEOUT).items
    ready = sum(n.ready for n in node_list)
    health = node_health(len(node_list), ready)
    summary = ClusterSummary(
        health=health,
        reason=None if health == "healthy" else f"{ready} of {len(node_list)} nodes are Ready",
        version=status.version,
        nodes=len(node_list),
        nodes_ready=ready,
        namespaces=len(namespaces),
        pods=total,
        pods_running=running,
        metrics=error is None,
        metrics_error=error,
    )
    with_usage = [n for n in node_list if n.cpu and n.memory]
    if error is None and with_usage:
        summary.cpu = Gauge(
            used=sum(n.cpu.used for n in with_usage if n.cpu),
            capacity=sum(n.cpu.capacity for n in with_usage if n.cpu),
        )
        summary.memory = Gauge(
            used=sum(n.memory.used for n in with_usage if n.memory),
            capacity=sum(n.memory.capacity for n in with_usage if n.memory),
        )
    return summary
