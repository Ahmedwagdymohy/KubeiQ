"""How pods spread across nodes: a balance score, per-node load and scale-down candidates."""

import statistics
from typing import Any, Literal

from kubernetes.client import ApiClient, CoreV1Api
from pydantic import BaseModel

from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.usage.quantity import parse
from kubeiq.usage.summary import node_metrics

NEARLY_EMPTY = 2  # pods other than DaemonSet pods


class PodDot(BaseModel):
    name: str
    namespace: str
    phase: str
    tone: Literal["ok", "warning", "bad", "done"]


class NodeLoad(BaseModel):
    name: str
    ready: bool
    unschedulable: bool
    roles: list[str]
    taints: list[str]
    pods: list[PodDot]
    running: int
    pending: int
    failed: int
    pods_capacity: float
    cpu_used: float | None
    cpu_capacity: float
    cpu_requested: float
    memory_used: float | None
    memory_capacity: float
    memory_requested: float
    candidate: str | None = None  # why it could be removed, when it could


class Distribution(BaseModel):
    score: int  # 0-100: how evenly pods spread over schedulable nodes
    verdict: Literal["Well balanced", "Moderate", "Imbalanced"]
    average: float  # pods per schedulable node
    nodes: list[NodeLoad]
    pending: list[PodDot]  # pods no node has taken
    issues: list[str]
    metrics: bool


def balance(counts: list[int]) -> int:
    """100 minus the spread (coefficient of variation) of pods per node, as a percentage."""
    if len(counts) < 2 or sum(counts) == 0:
        return 100
    mean = statistics.fmean(counts)
    cv = statistics.pstdev(counts) / mean
    return max(0, min(100, round(100 * (1 - cv))))


def verdict(score: int) -> Literal["Well balanced", "Moderate", "Imbalanced"]:
    return "Well balanced" if score >= 80 else "Moderate" if score >= 50 else "Imbalanced"


def _tone(pod: Any) -> Literal["ok", "warning", "bad", "done"]:
    phase = pod.status.phase if pod.status else "Unknown"
    if phase == "Succeeded":
        return "done"
    if phase in ("Failed", "Unknown"):
        return "bad"
    statuses = (pod.status.container_statuses or []) if pod.status else []
    if any(
        s.state and s.state.waiting and s.state.waiting.reason not in (None, "ContainerCreating")
        for s in statuses
    ):
        return "bad"
    if phase == "Pending" or not all(s.ready for s in statuses):
        return "warning"
    return "ok"


def _requests(pod: Any, what: str) -> float:
    total = 0.0
    for c in pod.spec.containers or []:
        requests = (c.resources.requests or {}) if c.resources else {}
        total += parse(requests.get(what))
    return total


def _daemon(pod: Any) -> bool:
    return any(o.kind == "DaemonSet" for o in pod.metadata.owner_references or [])


def analyze(api: ApiClient, namespace: str | None) -> Distribution:
    core = CoreV1Api(api)
    nodes: list[Any] = core.list_node(_request_timeout=REQUEST_TIMEOUT).items
    pods: list[Any] = (
        core.list_namespaced_pod(namespace, _request_timeout=REQUEST_TIMEOUT).items
        if namespace
        else core.list_pod_for_all_namespaces(_request_timeout=REQUEST_TIMEOUT).items
    )
    try:
        usage = node_metrics(api)
    except Exception:
        usage = {}
    by_node: dict[str, list[Any]] = {}
    pending: list[PodDot] = []
    for pod in pods:
        dot = PodDot(
            name=pod.metadata.name,
            namespace=pod.metadata.namespace,
            phase=pod.status.phase or "Unknown",
            tone=_tone(pod),
        )
        if pod.spec.node_name:
            by_node.setdefault(pod.spec.node_name, []).append(pod)
        elif dot.phase == "Pending":
            pending.append(dot)

    loads: list[NodeLoad] = []
    for node in nodes:
        name = node.metadata.name
        labels = node.metadata.labels or {}
        allocatable = node.status.allocatable or {}
        ready = any(c.type == "Ready" and c.status == "True" for c in node.status.conditions or [])
        mine = by_node.get(name, [])
        active = [p for p in mine if (p.status.phase or "") not in ("Succeeded", "Failed")]
        roles = sorted(
            k.split("/", 1)[1] for k in labels if k.startswith("node-role.kubernetes.io/")
        ) or ["worker"]
        used = usage.get(name)
        load = NodeLoad(
            name=name,
            ready=ready,
            unschedulable=bool(node.spec.unschedulable),
            roles=roles,
            taints=[f"{t.key}:{t.effect}" for t in node.spec.taints or []],
            pods=[
                PodDot(
                    name=p.metadata.name,
                    namespace=p.metadata.namespace,
                    phase=p.status.phase or "Unknown",
                    tone=_tone(p),
                )
                for p in mine
            ],
            running=sum(1 for p in mine if p.status.phase == "Running"),
            pending=sum(1 for p in mine if p.status.phase == "Pending"),
            failed=sum(1 for p in mine if p.status.phase == "Failed"),
            pods_capacity=parse(allocatable.get("pods")),
            cpu_used=used[0] if used else None,
            cpu_capacity=parse(allocatable.get("cpu")),
            cpu_requested=sum(_requests(p, "cpu") for p in active),
            memory_used=used[1] if used else None,
            memory_capacity=parse(allocatable.get("memory")),
            memory_requested=sum(_requests(p, "memory") for p in active),
        )
        regular = [p for p in active if not _daemon(p)]
        if (
            ready
            and not load.unschedulable
            and "control-plane" not in roles
            and "master" not in roles
            and not load.taints
            and len(regular) <= NEARLY_EMPTY
            and not namespace  # only meaningful when every pod is counted
        ):
            load.candidate = (
                f"Ready, schedulable and untainted, running {len(regular)} "
                f"{'pod' if len(regular) == 1 else 'pods'} besides DaemonSets. "
                "Its pods would fit elsewhere if the other nodes have room"
            )
        loads.append(load)

    schedulable = [
        n
        for n in loads
        if n.ready and not n.unschedulable and not any(t.endswith("NoSchedule") for t in n.taints)
    ]
    counts = [len([p for p in n.pods if p.tone != "done"]) for n in schedulable]
    score = balance(counts)
    issues = []
    cordoned = [n.name for n in loads if n.unschedulable]
    not_ready = [n.name for n in loads if not n.ready]
    if not_ready:
        issues.append(f"{len(not_ready)} not ready: {', '.join(not_ready[:5])}")
    if cordoned:
        issues.append(f"{len(cordoned)} cordoned: {', '.join(cordoned[:5])}")
    if pending:
        noun = "pod" if len(pending) == 1 else "pods"
        issues.append(f"{len(pending)} {noun} pending, not placed on any node")
    loads.sort(key=lambda n: (-len(n.pods), n.name))
    return Distribution(
        score=score,
        verdict=verdict(score),
        average=round(statistics.fmean(counts), 1) if counts else 0.0,
        nodes=loads,
        pending=pending,
        issues=issues,
        metrics=bool(usage),
    )
