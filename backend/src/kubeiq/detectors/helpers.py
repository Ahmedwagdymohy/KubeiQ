"""Shared lookups over an EvidenceBundle."""

from kubeiq.collectors.models import (
    ContainerSnapshot,
    EventRecord,
    EvidenceBundle,
    LogExcerpt,
    PodSnapshot,
    make_ref,
)


def workload_of(pod: PodSnapshot) -> str:
    """Best-effort owning workload: ReplicaSet → Deployment via the pod-template-hash label."""
    if not pod.owner:
        return pod.ref
    kind, _, name = pod.owner.partition("/")
    template_hash = pod.labels.get("pod-template-hash")
    if kind == "ReplicaSet" and template_hash and name.endswith(f"-{template_hash}"):
        return make_ref("Deployment", pod.namespace, name.removesuffix(f"-{template_hash}"))
    return make_ref(kind, pod.namespace, name)


def events_for(bundle: EvidenceBundle, ref: str) -> list[EventRecord]:
    return [e for e in bundle.events if e.involved == ref]


def logs_for(bundle: EvidenceBundle, pod: PodSnapshot, container: str) -> list[LogExcerpt]:
    """Excerpts for a container, previous run first (it usually holds the crash)."""
    found = [lg for lg in bundle.logs if lg.pod == pod.ref and lg.container == container]
    return sorted(found, key=lambda lg: not lg.previous)


def app_containers(pod: PodSnapshot) -> list[ContainerSnapshot]:
    return [c for c in pod.containers if not c.init]


def has_env(container: ContainerSnapshot, name: str) -> bool:
    return any(e.name == name for e in container.env)
