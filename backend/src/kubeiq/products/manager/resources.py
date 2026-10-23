"""Lists, objects, events and logs for any resource kind. Secret values are never fetched."""

from typing import Any

import yaml
from kubernetes.client import ApiClient

from kubeiq.products.manager.kube import METADATA_ONLY, TABLE, request, resource_path
from kubeiq.products.manager.models import (
    Column,
    KubeEvent,
    ObjectDetail,
    PodLogs,
    ResourceList,
    Row,
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
