"""Workload collector: Deployments, StatefulSets and DaemonSets with rollout health."""

from typing import Any

from kubernetes.client import ApiClient, AppsV1Api

from kubeiq.collectors.models import Condition, Scope, WorkloadSnapshot, make_ref
from kubeiq.core.k8s import REQUEST_TIMEOUT


def collect(api: ApiClient, scope: Scope) -> list[WorkloadSnapshot]:
    apps = AppsV1Api(api)
    kw: dict[str, Any] = {"_request_timeout": REQUEST_TIMEOUT}

    def fetch(namespaced: Any, all_namespaces: Any) -> list[Any]:
        result = namespaced(scope.namespace, **kw) if scope.namespace else all_namespaces(**kw)
        return list(result.items)

    deployments = fetch(apps.list_namespaced_deployment, apps.list_deployment_for_all_namespaces)
    statefulsets = fetch(
        apps.list_namespaced_stateful_set, apps.list_stateful_set_for_all_namespaces
    )
    daemonsets = fetch(apps.list_namespaced_daemon_set, apps.list_daemon_set_for_all_namespaces)
    return (
        [from_deployment(d) for d in deployments]
        + [from_statefulset(s) for s in statefulsets]
        + [from_daemonset(d) for d in daemonsets]
    )


def from_deployment(d: Any) -> WorkloadSnapshot:
    s = d.status
    return _snapshot(
        "Deployment",
        d,
        desired=d.spec.replicas if d.spec.replicas is not None else 1,
        ready=s.ready_replicas,
        available=s.available_replicas,
        updated=s.updated_replicas,
    )


def from_statefulset(st: Any) -> WorkloadSnapshot:
    s = st.status
    return _snapshot(
        "StatefulSet",
        st,
        desired=st.spec.replicas if st.spec.replicas is not None else 1,
        ready=s.ready_replicas,
        available=s.available_replicas,
        updated=s.updated_replicas,
    )


def from_daemonset(ds: Any) -> WorkloadSnapshot:
    s = ds.status
    return _snapshot(
        "DaemonSet",
        ds,
        desired=s.desired_number_scheduled,
        ready=s.number_ready,
        available=s.number_available,
        updated=s.updated_number_scheduled,
    )


def _snapshot(
    kind: Any, obj: Any, desired: int, ready: int | None, available: int | None, updated: int | None
) -> WorkloadSnapshot:
    meta = obj.metadata
    selector = obj.spec.selector
    return WorkloadSnapshot(
        ref=make_ref(kind, meta.namespace, meta.name),
        kind=kind,
        name=meta.name,
        namespace=meta.namespace,
        desired=desired or 0,
        ready=ready or 0,
        available=available or 0,
        updated=updated or 0,
        selector=dict((selector and selector.match_labels) or {}),
        conditions=[
            Condition(type=c.type, status=c.status, reason=c.reason, message=c.message)
            for c in obj.status.conditions or []
        ],
    )
