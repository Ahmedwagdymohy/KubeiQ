"""Turn collected evidence into map resources and attach health from the detectors."""

import re
from collections import Counter
from datetime import UTC, datetime

from kubeiq.collectors.models import EnvSource, EvidenceBundle, Gap, PodSnapshot
from kubeiq.detectors.models import Incident, Severity
from kubeiq.products.map.models import ClusterMap, MapEdge, MapNode, Resource, Status
from kubeiq.products.map.relations import build_edges

_VOLUME = re.compile(r"^[^:]+: (configMap|secret|pvc)/(.+)$")
_REF_KINDS = {"configMap": "ConfigMap", "secret": "Secret", "pvc": "PersistentVolumeClaim"}
_MISSING_OBJECT = re.compile(r"\b(Secret|ConfigMap) ([\w.-]+) (?:does not exist|is missing key)")
_RANK: dict[Status, int] = {"healthy": 0, "warning": 1, "error": 2}


def _pod_refs(pod: PodSnapshot) -> dict[str, list[str]]:
    refs: dict[str, set[str]] = {}

    def add(kind: str, name: str) -> None:
        refs.setdefault(_REF_KINDS[kind], set()).add(name)

    for volume in pod.volumes:
        found = _VOLUME.match(volume)
        if found:
            add(found.group(1), found.group(2))
    for c in pod.containers:
        for source in c.env_from:
            kind, _, name = source.partition("/")
            if kind in _REF_KINDS:
                add(kind, name)
        for env in c.env:
            if env.ref and env.source in (EnvSource.SECRET, EnvSource.CONFIG_MAP):
                add(env.source.value, env.ref.split("/")[0])
    return {kind: sorted(names) for kind, names in refs.items()}


def _pod(pod: PodSnapshot) -> Resource:
    app = [c for c in pod.containers if not c.init]
    ready = sum(c.ready for c in app)
    restarts = sum(c.restart_count for c in pod.containers)
    facts = {"Phase": pod.phase, "Ready": f"{ready}/{len(app)}", "Restarts": str(restarts)}
    if pod.node:
        facts["Node"] = pod.node
    reason = next((c.reason for c in pod.containers if c.reason), None) or pod.reason
    return Resource(
        kind="Pod",
        name=pod.name,
        namespace=pod.namespace,
        owner=pod.owner,
        labels=pod.labels,
        refs=_pod_refs(pod),
        facts=facts,
        status="warning" if pod.unhealthy else "healthy",
        reason=reason if pod.unhealthy else None,
    )


def resources_from(bundle: EvidenceBundle) -> list[Resource]:
    resources = [_pod(p) for p in bundle.pods]
    for w in bundle.workloads:
        short = w.ready < w.desired
        resources.append(
            Resource(
                kind=w.kind,
                name=w.name,
                namespace=w.namespace,
                selector=w.selector,
                facts={"Ready": f"{w.ready}/{w.desired}", "Up to date": str(w.updated)},
                status="warning" if short else "healthy",
                reason=f"{w.ready} of {w.desired} replicas ready" if short else None,
            )
        )
    for s in bundle.services:
        empty = bool(s.selector) and s.ready_endpoints == 0
        facts = {"Type": s.type, "Endpoints": f"{s.ready_endpoints} ready"}
        if s.ports:
            facts["Ports"] = ", ".join(s.ports)
        resources.append(
            Resource(
                kind="Service",
                name=s.name,
                namespace=s.namespace,
                selector=s.selector,
                facts=facts,
                status="warning" if empty else "healthy",
                reason="No ready endpoints" if empty else None,
            )
        )
    return resources


def _referenced(resources: list[Resource], configmaps: set[str]) -> list[Resource]:
    """ConfigMap and Secret nodes for what pods reference. Secrets are names only, never read."""
    seen: dict[str, Resource] = {}
    for r in resources:
        for kind in ("ConfigMap", "Secret"):
            for name in r.refs.get(kind, []):
                node = Resource(kind=kind, name=name, namespace=r.namespace)
                if kind == "ConfigMap" and f"{r.namespace}/{name}" not in configmaps:
                    node.status, node.reason = "error", f"ConfigMap {name} does not exist"
                seen.setdefault(node.ref, node)
    return list(seen.values())


def _apply_incidents(nodes: dict[str, MapNode], incidents: list[Incident]) -> None:
    for incident in incidents:
        status: Status = "error" if incident.severity == Severity.CRITICAL else "warning"
        reason = incident.root.cause or incident.root.summary
        targets = set(incident.affected)
        # The workload only takes the incident's colour when it is unhealthy itself: a Service
        # selector typo is the Service's problem, not the healthy Deployment's.
        workload = nodes.get(incident.workload)
        if workload and (workload.status != "healthy" or incident.workload in targets):
            targets.add(incident.workload)
        found = _MISSING_OBJECT.search(reason)
        if found:
            namespace = (
                incident.workload.split("/")[1] if incident.workload.count("/") == 2 else None
            )
            targets.add("/".join(p for p in (found.group(1), namespace, found.group(2)) if p))
        for ref in targets:
            node = nodes.get(ref)
            if node and _RANK[status] >= _RANK[node.status]:
                node.status, node.reason, node.investigate = status, reason, incident.workload


def _propagate_to_owners(nodes: dict[str, MapNode], edges: list[MapEdge]) -> None:
    """A ReplicaSet or Job between a failing pod and its workload shares the pod's cause."""
    for edge in edges:
        child, owner = nodes[edge.source], nodes[edge.target]
        if child.kind != "Pod" or owner.kind not in {"ReplicaSet", "Job"} or not child.investigate:
            continue
        if _RANK[child.status] >= _RANK[owner.status]:
            owner.status, owner.reason, owner.investigate = (
                child.status,
                child.reason,
                child.investigate,
            )


def build_map(
    bundle: EvidenceBundle,
    extras: list[Resource],
    configmaps: list[str],
    incidents: list[Incident],
    gaps: list[Gap] | None = None,
) -> ClusterMap:
    resources = resources_from(bundle) + extras
    resources += _referenced(resources, set(configmaps))
    nodes = {
        r.ref: MapNode(
            id=r.ref,
            kind=r.kind,
            name=r.name,
            namespace=r.namespace,
            status=r.status,
            reason=r.reason,
            facts=r.facts,
            labels=r.labels,
        )
        for r in resources
    }
    _apply_incidents(nodes, incidents)
    edges = [e for e in build_edges(resources) if e.source in nodes and e.target in nodes]
    _propagate_to_owners(nodes, edges)
    for node in nodes.values():
        # Anything unhealthy can be investigated; the namespace scan finds its incident.
        if node.status != "healthy" and node.investigate is None:
            node.investigate = node.id
    counts = Counter(n.status for n in nodes.values())
    return ClusterMap(
        cluster_id=bundle.scope.cluster_id,
        namespace=bundle.scope.namespace,
        collected_at=datetime.now(UTC),
        nodes=list(nodes.values()),
        edges=edges,
        counts={s: counts.get(s, 0) for s in ("healthy", "warning", "error")},
        gaps=[*bundle.gaps, *(gaps or [])],
    )
