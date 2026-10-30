"""Lists, objects, events and logs for any resource kind. Secret values are never fetched."""

import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import yaml
from kubernetes.client import ApiClient

from kubeiq.products.manager.kube import (
    METADATA_LIST,
    METADATA_ONLY,
    TABLE,
    request,
    resource_path,
)
from kubeiq.products.manager.models import (
    Column,
    KubeEvent,
    ObjectDetail,
    PodLogs,
    ResourceList,
    Row,
    SearchHit,
    WorkloadPod,
)

LIST_LIMIT = 500
EVENT_LIMIT = 50
MAX_LOG_LINES = 2000
MAX_LOG_BYTES = 1_000_000
_LAST_APPLIED = "kubectl.kubernetes.io/last-applied-configuration"


def is_secret(group: str, resource: str) -> bool:
    return group == "" and resource == "secrets"


def list_resources(
    api: ApiClient, group: str, version: str, resource: str, namespace: str | None
) -> ResourceList:
    path = resource_path(group, version, resource, namespace)
    table = request(api, "GET", path, query=[("limit", LIST_LIMIT)], accept=TABLE)
    definitions = table.get("columnDefinitions") or []
    keep = [i for i, c in enumerate(definitions) if c.get("priority", 0) == 0]
    columns = [
        Column(
            name=definitions[i].get("name", ""),
            type=definitions[i].get("type", "string"),
            description=definitions[i].get("description", ""),
        )
        for i in keep
    ]
    rows = []
    for row in table.get("rows") or []:
        meta = (row.get("object") or {}).get("metadata") or {}
        cells = row.get("cells") or []
        rows.append(
            Row(
                name=meta.get("name", cells[0] if cells else ""),
                namespace=meta.get("namespace"),
                created=meta.get("creationTimestamp"),
                cells=[cells[i] if i < len(cells) else None for i in keep],
            )
        )
    truncated = bool((table.get("metadata") or {}).get("continue"))
    return ResourceList(columns=columns, rows=rows, truncated=truncated)


def clean(obj: dict[str, Any], secret: bool) -> dict[str, Any]:
    meta = obj.get("metadata") or {}
    meta.pop("managedFields", None)
    if secret:
        # Applied manifests can embed the Secret's data in this annotation.
        (meta.get("annotations") or {}).pop(_LAST_APPLIED, None)
        for key in ("data", "stringData"):
            obj.pop(key, None)
    return obj


def get_object(
    api: ApiClient, group: str, version: str, resource: str, namespace: str | None, name: str
) -> ObjectDetail:
    secret = is_secret(group, resource)
    path = resource_path(group, version, resource, namespace, name)
    obj = clean(
        request(api, "GET", path, accept=METADATA_ONLY if secret else "application/json"), secret
    )
    if secret:
        obj["kind"], obj["apiVersion"] = "Secret", "v1"
    text = yaml.safe_dump(obj, sort_keys=False, allow_unicode=True, width=120)
    return ObjectDetail(object=obj, yaml=text, values_hidden=secret)


def events_for(api: ApiClient, kind: str, namespace: str | None, name: str) -> list[KubeEvent]:
    selector = f"involvedObject.name={name},involvedObject.kind={kind}"
    path = f"/api/v1/namespaces/{namespace}/events" if namespace else "/api/v1/events"
    resource_path("", "v1", "events", namespace)  # validates the namespace
    body = request(api, "GET", path, query=[("fieldSelector", selector), ("limit", 200)])
    events = []
    for item in body.get("items") or []:
        last = (
            item.get("lastTimestamp")
            or item.get("eventTime")
            or (item.get("metadata") or {}).get("creationTimestamp")
        )
        events.append(
            KubeEvent(
                type=item.get("type") or "Normal",
                reason=item.get("reason") or "",
                message=(item.get("message") or "").strip(),
                count=item.get("count") or 1,
                last_seen=last,
            )
        )
    events.sort(key=lambda e: e.last_seen or "", reverse=True)
    return events[:EVENT_LIMIT]


def pod_logs(
    api: ApiClient,
    namespace: str,
    pod: str,
    container: str | None,
    tail: int,
    previous: bool,
) -> PodLogs:
    obj = request(api, "GET", resource_path("", "v1", "pods", namespace, pod))
    spec = obj.get("spec") or {}
    containers = [c["name"] for c in spec.get("initContainers") or []] + [
        c["name"] for c in spec.get("containers") or []
    ]
    chosen = (
        container if container in containers else (spec.get("containers") or [{}])[0].get("name")
    )
    if not chosen:
        return PodLogs(container="", containers=containers, lines=[], truncated=False)
    tail = max(1, min(tail, MAX_LOG_LINES))
    query: list[tuple[str, Any]] = [
        ("container", chosen),
        ("tailLines", tail),
        ("limitBytes", MAX_LOG_BYTES),
        ("timestamps", "true"),
    ]
    if previous:
        query.append(("previous", "true"))
    text = request(
        api,
        "GET",
        resource_path("", "v1", "pods", namespace, pod) + "/log",
        query=query,
        accept="*/*",
        raw=True,
    )
    lines = text.splitlines()
    return PodLogs(
        container=chosen, containers=containers, lines=lines, truncated=len(lines) >= tail
    )


# Kinds whose pods are found through spec.selector: their logs are the logs of those pods.
SELECTS_PODS = {
    ("apps", "deployments"),
    ("apps", "statefulsets"),
    ("apps", "daemonsets"),
    ("apps", "replicasets"),
    ("batch", "jobs"),
    ("", "services"),
}
MAX_WORKLOAD_PODS = 100


def label_selector(spec_selector: dict[str, Any] | None) -> str:
    """A Kubernetes label selector string from spec.selector (a LabelSelector, or a Service map)."""
    if not spec_selector:
        return ""
    if "matchLabels" not in spec_selector and "matchExpressions" not in spec_selector:
        return ",".join(f"{k}={v}" for k, v in spec_selector.items())  # Service selector
    parts = [f"{k}={v}" for k, v in (spec_selector.get("matchLabels") or {}).items()]
    for expr in spec_selector.get("matchExpressions") or []:
        key, op, values = expr.get("key"), expr.get("operator"), expr.get("values") or []
        if op == "In":
            parts.append(f"{key} in ({','.join(values)})")
        elif op == "NotIn":
            parts.append(f"{key} notin ({','.join(values)})")
        elif op == "Exists":
            parts.append(key)
        elif op == "DoesNotExist":
            parts.append(f"!{key}")
    return ",".join(parts)


def workload_pods(
    api: ApiClient, group: str, version: str, resource: str, namespace: str, name: str
) -> list[WorkloadPod]:
    """The pods a workload or Service selects, the ones with problems first."""
    if (group, resource) not in SELECTS_PODS:
        return []
    obj = request(api, "GET", resource_path(group, version, resource, namespace, name))
    selector = label_selector((obj.get("spec") or {}).get("selector"))
    if not selector:
        return []
    listing = request(
        api,
        "GET",
        resource_path("", "v1", "pods", namespace),
        query=[("labelSelector", selector), ("limit", MAX_WORKLOAD_PODS)],
    )
    pods = [_workload_pod(item) for item in listing.get("items") or []]
    return sorted(
        pods, key=lambda p: (p.ready.split("/")[0] == p.ready.split("/")[1], -p.restarts, p.name)
    )


def _workload_pod(item: dict[str, Any]) -> WorkloadPod:
    status = item.get("status") or {}
    statuses = (status.get("initContainerStatuses") or []) + (status.get("containerStatuses") or [])
    main = status.get("containerStatuses") or []
    waiting = next(
        (
            s["state"]["waiting"].get("reason")
            for s in statuses
            if (s.get("state") or {}).get("waiting")
        ),
        None,
    )
    total = len((item.get("spec") or {}).get("containers") or []) or len(main)
    return WorkloadPod(
        name=item["metadata"]["name"],
        status=waiting or status.get("phase") or "Unknown",
        ready=f"{sum(bool(s.get('ready')) for s in main)}/{total}",
        restarts=sum(int(s.get("restartCount") or 0) for s in statuses),
    )


# What the command palette finds by name: (group, version, resource, kind, namespaced).
SEARCH_KINDS = [
    ("apps", "v1", "deployments", "Deployment", True),
    ("apps", "v1", "statefulsets", "StatefulSet", True),
    ("apps", "v1", "daemonsets", "DaemonSet", True),
    ("batch", "v1", "cronjobs", "CronJob", True),
    ("batch", "v1", "jobs", "Job", True),
    ("", "v1", "pods", "Pod", True),
    ("", "v1", "services", "Service", True),
    ("networking.k8s.io", "v1", "ingresses", "Ingress", True),
    ("", "v1", "configmaps", "ConfigMap", True),
    ("", "v1", "secrets", "Secret", True),
    ("", "v1", "persistentvolumeclaims", "PersistentVolumeClaim", True),
    ("", "v1", "namespaces", "Namespace", False),
    ("", "v1", "nodes", "Node", False),
]
SEARCH_LIMIT = 40
_PER_KIND = 8
_SEARCH_TTL = 20.0
_names: dict[tuple[str, str], tuple[float, list[tuple[str | None, str]]]] = {}


def _names_at(cache_key: str, api: ApiClient, path: str) -> list[tuple[str | None, str]]:
    """(namespace, name) of every object at a list path; metadata only, cached briefly."""
    cached = _names.get((cache_key, path))
    if cached and time.monotonic() - cached[0] < _SEARCH_TTL:
        return cached[1]
    body = request(api, "GET", path, query=[("limit", LIST_LIMIT)], accept=METADATA_LIST)
    found = [
        ((item.get("metadata") or {}).get("namespace"), (item.get("metadata") or {})["name"])
        for item in body.get("items") or []
        if (item.get("metadata") or {}).get("name")
    ]
    _names[(cache_key, path)] = (time.monotonic(), found)
    return found


def search(
    cache_key: str, api: ApiClient, text: str, namespaces: list[str] | None
) -> list[SearchHit]:
    """Objects whose name contains ``text``, names that start with it first.

    ``namespaces=None`` searches everything (cluster-wide kinds too); a list limits the search to
    those namespaces, for members whose projects allow only some.
    """
    needle = text.strip().lower()
    if not needle:
        return []
    jobs: list[tuple[tuple[str, str, str, str, bool], str]] = []
    for kind in SEARCH_KINDS:
        group, version, resource, _, namespaced = kind
        if namespaces is None:
            jobs.append((kind, resource_path(group, version, resource)))
        elif namespaced:
            jobs += [(kind, resource_path(group, version, resource, ns)) for ns in namespaces]

    def run(job: tuple[tuple[str, str, str, str, bool], str]) -> list[SearchHit]:
        (group, version, resource, kind, _), path = job
        try:
            names = _names_at(cache_key, api, path)
        except Exception:
            return []  # a kind this identity may not list, or a missing API
        hits = [
            SearchHit(
                group=group, version=version, resource=resource, kind=kind, namespace=ns, name=n
            )
            for ns, n in names
            if needle in n.lower()
        ]
        hits.sort(key=lambda h: (not h.name.lower().startswith(needle), len(h.name), h.name))
        return hits[:_PER_KIND]

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = [hit for hits in pool.map(run, jobs) for hit in hits]
    results.sort(key=lambda h: (not h.name.lower().startswith(needle), len(h.name)))
    return results[:SEARCH_LIMIT]
