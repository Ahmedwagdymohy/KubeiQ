"""Node collector: readiness, pressure conditions, taints and allocatable capacity."""

from typing import Any

from kubernetes.client import ApiClient, CoreV1Api

from kubeiq.collectors.models import NodeSnapshot, Scope, make_ref
from kubeiq.core.k8s import REQUEST_TIMEOUT

_PRESSURE = {"MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"}


def collect(api: ApiClient, scope: Scope) -> list[NodeSnapshot]:
    # Nodes are cluster-scoped; collected regardless of namespace scope.
    result = CoreV1Api(api).list_node(_request_timeout=REQUEST_TIMEOUT)
    return [to_snapshot(node) for node in result.items]


def to_snapshot(node: Any) -> NodeSnapshot:
    conditions = node.status.conditions or []
    return NodeSnapshot(
        ref=make_ref("Node", None, node.metadata.name),
        name=node.metadata.name,
        ready=any(c.type == "Ready" and c.status == "True" for c in conditions),
        unschedulable=bool(node.spec.unschedulable),
        pressure=[c.type for c in conditions if c.type in _PRESSURE and c.status == "True"],
        taints=[
            f"{t.key}{'=' + t.value if t.value else ''}:{t.effect}" for t in node.spec.taints or []
        ],
        allocatable={
            k: v for k, v in (node.status.allocatable or {}).items() if k in {"cpu", "memory"}
        },
    )
