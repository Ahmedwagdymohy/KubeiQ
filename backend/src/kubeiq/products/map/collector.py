"""Kinds the map shows beyond the troubleshooting collectors. Read-only; never lists Secrets."""

from collections.abc import Callable
from typing import Any

from kubernetes.client import (
    ApiClient,
    AppsV1Api,
    AutoscalingV1Api,
    BatchV1Api,
    CoreV1Api,
    NetworkingV1Api,
)

from kubeiq.collectors.models import Gap, Scope
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.products.map.models import Resource

# ConfigMaps every namespace gets; they only add noise to the map.
_SYSTEM_CONFIGMAPS = {"kube-root-ca.crt"}


def _owner(meta: Any) -> str | None:
    owner = next((o for o in meta.owner_references or [] if o.controller), None)
    return f"{owner.kind}/{owner.name}" if owner else None


def replica_set(rs: Any) -> Resource | None:
    desired = rs.spec.replicas or 0
    if desired == 0:
        return None  # old revisions kept for rollback
    ready = rs.status.ready_replicas or 0
    return Resource(
        kind="ReplicaSet",
        name=rs.metadata.name,
        namespace=rs.metadata.namespace,
        owner=_owner(rs.metadata),
        labels=rs.metadata.labels or {},
        facts={"Ready": f"{ready}/{desired}"},
        status="healthy" if ready >= desired else "warning",
        reason=None if ready >= desired else f"{ready} of {desired} replicas ready",
    )


def job(j: Any) -> Resource:
    status = j.status
    failed, succeeded = status.failed or 0, status.succeeded or 0
    done = any(c.type == "Complete" and c.status == "True" for c in status.conditions or [])
    broken = any(c.type == "Failed" and c.status == "True" for c in status.conditions or [])
    return Resource(
        kind="Job",
        name=j.metadata.name,
        namespace=j.metadata.namespace,
        owner=_owner(j.metadata),
        labels=j.metadata.labels or {},
        facts={
            "Succeeded": str(succeeded),
            "Failed": str(failed),
            "Active": str(status.active or 0),
        },
        status="error" if broken else "healthy" if done or not failed else "warning",
        reason="Job failed" if broken else None,
    )


def cron_job(cj: Any) -> Resource:
    last = cj.status.last_schedule_time if cj.status else None
    facts = {"Schedule": cj.spec.schedule}
    if cj.spec.suspend:
        facts["Suspended"] = "yes"
    if last:
        facts["Last run"] = last.isoformat(timespec="minutes")
    return Resource(
        kind="CronJob",
        name=cj.metadata.name,
        namespace=cj.metadata.namespace,
        labels=cj.metadata.labels or {},
        facts=facts,
    )


def pvc(claim: Any) -> Resource:
    phase = claim.status.phase or "Unknown"
    capacity = (claim.status.capacity or {}).get("storage") or (
        (claim.spec.resources.requests or {}).get("storage") if claim.spec.resources else None
    )
    facts = {"Phase": phase}
    if capacity:
        facts["Size"] = capacity
    if claim.spec.storage_class_name:
        facts["Storage class"] = claim.spec.storage_class_name
    return Resource(
        kind="PersistentVolumeClaim",
        name=claim.metadata.name,
        namespace=claim.metadata.namespace,
        labels=claim.metadata.labels or {},
        access_modes=list(claim.spec.access_modes or []),
        facts=facts,
        status="error" if phase == "Lost" else "warning" if phase == "Pending" else "healthy",
        reason={"Lost": "Volume lost", "Pending": "Not bound to a volume"}.get(phase),
    )


def ingress(ing: Any) -> Resource:
    services: list[str] = []
    hosts: list[str] = []
    backend = ing.spec.default_backend
    if backend and backend.service:
        services.append(backend.service.name)
    for rule in ing.spec.rules or []:
        if rule.host:
            hosts.append(rule.host)
        for path in rule.http.paths if rule.http else []:
            if path.backend.service:
                services.append(path.backend.service.name)
    tls = [t.secret_name for t in ing.spec.tls or [] if t.secret_name]
    facts = {"Hosts": ", ".join(hosts)} if hosts else {}
    return Resource(
        kind="Ingress",
        name=ing.metadata.name,
        namespace=ing.metadata.namespace,
        labels=ing.metadata.labels or {},
        refs={"Service": sorted(set(services)), "Secret": sorted(set(tls))},
        facts=facts,
    )


def hpa(h: Any) -> Resource:
    target = h.spec.scale_target_ref
    return Resource(
        kind="HorizontalPodAutoscaler",
        name=h.metadata.name,
        namespace=h.metadata.namespace,
        labels=h.metadata.labels or {},
        refs={target.kind: [target.name]},
        facts={
            "Replicas": f"{h.status.current_replicas or 0} (min {h.spec.min_replicas or 1}, "
            f"max {h.spec.max_replicas})"
        },
    )


def collect(api: ApiClient, scope: Scope) -> tuple[list[Resource], list[str], list[Gap]]:
    """Returns (resources, configmap names, gaps). A failing kind becomes a gap."""
    apps, batch, core = AppsV1Api(api), BatchV1Api(api), CoreV1Api(api)
    networking, autoscaling = NetworkingV1Api(api), AutoscalingV1Api(api)
    kw: dict[str, Any] = {"_request_timeout": REQUEST_TIMEOUT}
    resources: list[Resource] = []
    configmaps: list[str] = []
    gaps: list[Gap] = []

    def fetch(name: str, namespaced: Any, all_namespaces: Any) -> list[Any]:
        try:
            result = namespaced(scope.namespace, **kw) if scope.namespace else all_namespaces(**kw)
        except Exception as exc:  # RBAC or API not served; the map still renders
            gaps.append(Gap(collector=name, error=str(exc).splitlines()[0][:200]))
            return []
        return list(result.items)

    kinds: list[tuple[str, Any, Any, Callable[[Any], Resource | None]]] = [
        (
            "replicasets",
            apps.list_namespaced_replica_set,
            apps.list_replica_set_for_all_namespaces,
            replica_set,
        ),
        ("jobs", batch.list_namespaced_job, batch.list_job_for_all_namespaces, job),
        (
            "cronjobs",
            batch.list_namespaced_cron_job,
            batch.list_cron_job_for_all_namespaces,
            cron_job,
        ),
        (
            "persistentvolumeclaims",
            core.list_namespaced_persistent_volume_claim,
            core.list_persistent_volume_claim_for_all_namespaces,
            pvc,
        ),
        (
            "ingresses",
            networking.list_namespaced_ingress,
            networking.list_ingress_for_all_namespaces,
            ingress,
        ),
        (
            "horizontalpodautoscalers",
            autoscaling.list_namespaced_horizontal_pod_autoscaler,
            autoscaling.list_horizontal_pod_autoscaler_for_all_namespaces,
            hpa,
        ),
    ]
    for name, namespaced, all_namespaces, convert in kinds:
        for item in fetch(name, namespaced, all_namespaces):
            resource = convert(item)
            if resource:
                resources.append(resource)

    for cm in fetch(
        "configmaps", core.list_namespaced_config_map, core.list_config_map_for_all_namespaces
    ):
        if cm.metadata.name not in _SYSTEM_CONFIGMAPS:
            configmaps.append(f"{cm.metadata.namespace}/{cm.metadata.name}")
    return resources, configmaps, gaps
