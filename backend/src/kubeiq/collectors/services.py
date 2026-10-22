"""Service collector: selectors and endpoint readiness (from EndpointSlices)."""

from collections import defaultdict
from typing import Any

from kubernetes.client import ApiClient, CoreV1Api, DiscoveryV1Api

from kubeiq.collectors.models import Scope, ServiceSnapshot, make_ref
from kubeiq.core.k8s import REQUEST_TIMEOUT

SERVICE_NAME_LABEL = "kubernetes.io/service-name"


def collect(api: ApiClient, scope: Scope) -> list[ServiceSnapshot]:
    core, discovery = CoreV1Api(api), DiscoveryV1Api(api)
    kw: dict[str, Any] = {"_request_timeout": REQUEST_TIMEOUT}
    if scope.namespace:
        services = core.list_namespaced_service(scope.namespace, **kw).items
        slices = discovery.list_namespaced_endpoint_slice(scope.namespace, **kw).items
    else:
        services = core.list_service_for_all_namespaces(**kw).items
        slices = discovery.list_endpoint_slice_for_all_namespaces(**kw).items
    return build(services, slices)


def build(services: list[Any], slices: list[Any]) -> list[ServiceSnapshot]:
    ready: dict[tuple[str, str], int] = defaultdict(int)
    not_ready: dict[tuple[str, str], int] = defaultdict(int)
    for endpoint_slice in slices:
        meta = endpoint_slice.metadata
        name = (meta.labels or {}).get(SERVICE_NAME_LABEL)
        if not name:
            continue
        for endpoint in endpoint_slice.endpoints or []:
            is_ready = endpoint.conditions is None or endpoint.conditions.ready is not False
            target = ready if is_ready else not_ready
            target[(meta.namespace, name)] += 1

    snapshots = []
    for svc in services:
        meta, spec = svc.metadata, svc.spec
        key = (meta.namespace, meta.name)
        snapshots.append(
            ServiceSnapshot(
                ref=make_ref("Service", meta.namespace, meta.name),
                name=meta.name,
                namespace=meta.namespace,
                type=spec.type or "ClusterIP",
                selector=spec.selector or {},
                ports=[f"{p.port}->{p.target_port}/{p.protocol}" for p in spec.ports or []],
                ready_endpoints=ready[key],
                not_ready_endpoints=not_ready[key],
            )
        )
    return snapshots
