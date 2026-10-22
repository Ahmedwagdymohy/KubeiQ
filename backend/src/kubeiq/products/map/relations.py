# Copyright 2025 The Kubernetes Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Modified by the KubeiQ Authors: ported from Headlamp's
# frontend/src/components/resourceMap/sources/definitions/relations.tsx to Python, running on
# KubeiQ's collected snapshots instead of live KubeObjects. Owner links use the controller name
# (same namespace) instead of UIDs, and Secret relations use names from pod references only.
"""Relations between resources: which edges the map draws.

Edge direction follows Headlamp: a pod points at its owner, a Service at the pods it selects,
an Ingress at its Services, a PVC at the pods that mount it, an HPA at what it scales.
"""

from collections.abc import Iterable
from typing import Literal

from kubeiq.products.map.models import MapEdge, Resource


def matches_labels(selector: dict[str, str], labels: dict[str, str]) -> bool:
    return bool(selector) and all(labels.get(k) == v for k, v in selector.items())


def _edge(
    source: Resource, target: Resource, shared: Literal["source", "target"] | None = None
) -> MapEdge:
    return MapEdge(
        id=f"{source.ref}->{target.ref}",
        source=source.ref,
        target=target.ref,
        shared=shared,
    )


def build_edges(resources: Iterable[Resource]) -> list[MapEdge]:
    items = list(resources)
    by_ref = {r.ref: r for r in items}

    def find(kind: str, namespace: str | None, name: str) -> Resource | None:
        return by_ref.get("/".join(p for p in (kind, namespace, name) if p))

    edges: list[MapEdge] = []
    pods = [r for r in items if r.kind == "Pod"]
    for r in items:
        # Owner relations: Pod -> ReplicaSet/StatefulSet/DaemonSet/Job, ReplicaSet -> Deployment,
        # Job -> CronJob.
        if r.owner:
            kind, _, name = r.owner.partition("/")
            owner = find(kind, r.namespace, name)
            if owner:
                edges.append(_edge(r, owner))

        # Service -> Pod by label selector.
        if r.kind == "Service":
            edges.extend(
                _edge(r, p)
                for p in pods
                if p.namespace == r.namespace and matches_labels(r.selector, p.labels)
            )

        # Ingress -> Service, Ingress -> TLS Secret; HPA -> scale target.
        if r.kind in {"Ingress", "HorizontalPodAutoscaler"}:
            for kind, names in r.refs.items():
                for name in names:
                    target = find(kind, r.namespace, name)
                    if target:
                        edges.append(_edge(r, target))

        if r.kind == "Pod":
            # Pod -> ConfigMap / Secret (volumes, envFrom, env refs).
            for kind in ("ConfigMap", "Secret"):
                for name in r.refs.get(kind, []):
                    target = find(kind, r.namespace, name)
                    if target:
                        edges.append(_edge(r, target))
            # PVC -> Pod. A ReadWriteMany claim can be mounted by unrelated pods; it must not
            # merge their groups into one (Headlamp #4310), so the PVC side is marked shared.
            for name in r.refs.get("PersistentVolumeClaim", []):
                claim = find("PersistentVolumeClaim", r.namespace, name)
                if claim:
                    rwx = "ReadWriteMany" in claim.access_modes
                    edges.append(_edge(claim, r, "source" if rwx else None))

    unique: dict[str, MapEdge] = {}
    for edge in edges:
        unique.setdefault(edge.id, edge)
    return list(unique.values())
