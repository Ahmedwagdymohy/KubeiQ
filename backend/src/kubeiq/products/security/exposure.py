"""Which workloads can be reached from outside the cluster: behind a LoadBalancer or NodePort
Service, or an Ingress. A finding on such a workload ranks higher."""

from typing import Any

from kubernetes.client import ApiClient, AppsV1Api, CoreV1Api, NetworkingV1Api

from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.products.security.merge import workload_ref


def _matches(selector: dict[str, str] | None, labels: dict[str, str] | None) -> bool:
    return bool(selector) and all((labels or {}).get(k) == v for k, v in (selector or {}).items())


def exposed_workloads(api: ApiClient) -> set[str]:
    core, apps = CoreV1Api(api), AppsV1Api(api)
    services: list[Any] = core.list_service_for_all_namespaces(
        _request_timeout=REQUEST_TIMEOUT
    ).items
    public: set[tuple[str, str]] = {
        (s.metadata.namespace, s.metadata.name)
        for s in services
        if s.spec and s.spec.type in ("LoadBalancer", "NodePort")
    }
    try:
        ingresses: list[Any] = (
            NetworkingV1Api(api)
            .list_ingress_for_all_namespaces(_request_timeout=REQUEST_TIMEOUT)
            .items
        )
    except Exception:
        ingresses = []
    for ingress in ingresses:
        namespace = ingress.metadata.namespace
        backends = []
        if ingress.spec and ingress.spec.default_backend:
            backends.append(ingress.spec.default_backend)
        for rule in (ingress.spec.rules or []) if ingress.spec else []:
            for path in (rule.http.paths or []) if rule.http else []:
                backends.append(path.backend)
        for backend in backends:
            if backend and backend.service:
                public.add((namespace, backend.service.name))
    selectors = [
        (s.metadata.namespace, s.spec.selector)
        for s in services
        if (s.metadata.namespace, s.metadata.name) in public and s.spec
    ]
    if not selectors:
        return set()
    exposed: set[str] = set()
    workloads: list[tuple[str, Any]] = [
        ("Deployment", d)
        for d in apps.list_deployment_for_all_namespaces(_request_timeout=REQUEST_TIMEOUT).items
    ]
    workloads += [
        ("StatefulSet", d)
        for d in apps.list_stateful_set_for_all_namespaces(_request_timeout=REQUEST_TIMEOUT).items
    ]
    workloads += [
        ("DaemonSet", d)
        for d in apps.list_daemon_set_for_all_namespaces(_request_timeout=REQUEST_TIMEOUT).items
    ]
    for kind, obj in workloads:
        labels = (
            obj.spec.template.metadata.labels if obj.spec and obj.spec.template.metadata else {}
        )
        namespace = obj.metadata.namespace
        if any(ns == namespace and _matches(sel, labels) for ns, sel in selectors):
            exposed.add(workload_ref(kind, obj.metadata.name, namespace))
    return exposed
