"""Which resource kinds a cluster serves, grouped into categories for the sidebar."""

import asyncio
import re
import time
from typing import Any

from kubernetes.client import ApiClient

from kubeiq.products.manager.kube import request
from kubeiq.products.manager.models import Category, Kind

CATEGORIES: dict[str, list[tuple[str, str]]] = {
    "Workloads": [
        ("", "pods"),
        ("apps", "deployments"),
        ("apps", "statefulsets"),
        ("apps", "daemonsets"),
        ("apps", "replicasets"),
        ("batch", "jobs"),
        ("batch", "cronjobs"),
    ],
    "Network": [
        ("", "services"),
        ("networking.k8s.io", "ingresses"),
        ("networking.k8s.io", "ingressclasses"),
        ("networking.k8s.io", "networkpolicies"),
        ("discovery.k8s.io", "endpointslices"),
        ("gateway.networking.k8s.io", "gateways"),
        ("gateway.networking.k8s.io", "httproutes"),
    ],
    "Config": [
        ("", "configmaps"),
        ("", "secrets"),
        ("autoscaling", "horizontalpodautoscalers"),
        ("policy", "poddisruptionbudgets"),
        ("", "resourcequotas"),
        ("", "limitranges"),
        ("scheduling.k8s.io", "priorityclasses"),
        ("admissionregistration.k8s.io", "validatingwebhookconfigurations"),
        ("admissionregistration.k8s.io", "mutatingwebhookconfigurations"),
    ],
    "Storage": [
        ("", "persistentvolumeclaims"),
        ("", "persistentvolumes"),
        ("storage.k8s.io", "storageclasses"),
        ("storage.k8s.io", "csidrivers"),
    ],
    "Access": [
        ("", "serviceaccounts"),
        ("rbac.authorization.k8s.io", "roles"),
        ("rbac.authorization.k8s.io", "rolebindings"),
        ("rbac.authorization.k8s.io", "clusterroles"),
        ("rbac.authorization.k8s.io", "clusterrolebindings"),
    ],
    "Cluster": [
        ("", "nodes"),
        ("", "namespaces"),
        ("", "events"),
        ("apiextensions.k8s.io", "customresourcedefinitions"),
    ],
}

# Duplicates or legacy kinds that would only add noise.
_SKIP = {("", "endpoints"), ("events.k8s.io", "events"), ("", "componentstatuses")}

_TTL = 300.0
_cache: dict[str, tuple[float, list[Category]]] = {}


def label(kind: str) -> str:
    words = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", kind)
    if words.endswith("s"):
        return words + "es"
    if words.endswith("y"):
        return words[:-1] + "ies"
    return words + "s"


def _is_builtin(group: str) -> bool:
    return group == "" or "." not in group or group.endswith(".k8s.io")


def _kinds(group: str, version: str, body: dict[str, Any]) -> list[Kind]:
    kinds = []
    for item in body.get("resources", []):
        name = item.get("name", "")
        verbs = item.get("verbs") or []
        if "/" in name or "list" not in verbs or (group, name) in _SKIP:
            continue
        kinds.append(
            Kind(
                group=group,
                version=version,
                resource=name,
                kind=item.get("kind", name),
                label=label(item.get("kind", name)),
                namespaced=bool(item.get("namespaced")),
                verbs=sorted(verbs),
            )
        )
    return kinds


def _fetch(api: ApiClient) -> list[Kind]:
    kinds = _kinds("", "v1", request(api, "GET", "/api/v1"))
    groups = request(api, "GET", "/apis").get("groups", [])
    for group in groups:
        preferred = (group.get("preferredVersion") or {}).get("groupVersion")
        if not preferred:
            continue
        try:
            body = request(api, "GET", f"/apis/{preferred}")
        except Exception:  # noqa: S112 - an unavailable aggregated API must not hide the rest
            continue
        name, _, version = preferred.partition("/")
        kinds.extend(_kinds(name, version, body))
    return kinds


def categorize(kinds: list[Kind]) -> list[Category]:
    by_key = {(k.group, k.resource): k for k in kinds}
    used: set[tuple[str, str]] = set()
    categories = []
    for name, keys in CATEGORIES.items():
        found = [by_key[key] for key in keys if key in by_key]
        used.update(key for key in keys if key in by_key)
        if found:
            categories.append(Category(name=name, kinds=found))

    rest = [k for k in kinds if (k.group, k.resource) not in used]
    custom = sorted((k for k in rest if not _is_builtin(k.group)), key=lambda k: (k.group, k.label))
    other = sorted((k for k in rest if _is_builtin(k.group)), key=lambda k: k.label)
    if custom:
        categories.append(Category(name="Custom Resources", kinds=custom))
    if other:
        categories.append(Category(name="Other", kinds=other))
    return categories


async def discover(cluster_id: str, api: ApiClient, refresh: bool = False) -> list[Category]:
    cached = _cache.get(cluster_id)
    if cached and not refresh and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    categories = categorize(await asyncio.to_thread(_fetch, api))
    _cache[cluster_id] = (time.monotonic(), categories)
    return categories
