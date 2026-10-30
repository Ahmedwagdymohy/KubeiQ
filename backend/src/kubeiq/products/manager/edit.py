"""Edit YAML and create objects (ADR 0009): validated by the API server with a dry run first."""

from typing import Any

import yaml
from kubernetes.client import ApiClient
from pydantic import BaseModel

from kubeiq.products.manager.kube import request, resource_path
from kubeiq.products.manager.models import Kind
from kubeiq.products.manager.resources import clean, is_secret

MAX_YAML_BYTES = 512_000


class EditError(ValueError):
    pass


class ApplyResult(BaseModel):
    yaml: str
    object: dict[str, Any]
    name: str
    namespace: str | None
    created: bool
    dry_run: bool


def parse(text: str) -> dict[str, Any]:
    if len(text.encode()) > MAX_YAML_BYTES:
        raise EditError("The YAML is too large")
    try:
        docs = [d for d in yaml.safe_load_all(text) if d is not None]
    except yaml.YAMLError as exc:
        raise EditError(f"This is not valid YAML: {exc}") from exc
    if len(docs) != 1 or not isinstance(docs[0], dict):
        raise EditError("Paste one Kubernetes object")
    obj = docs[0]
    if not obj.get("apiVersion") or not obj.get("kind"):
        raise EditError("The object needs apiVersion and kind")
    if not (obj.get("metadata") or {}).get("name"):
        raise EditError("The object needs metadata.name")
    return obj


def kind_of(obj: dict[str, Any], kinds: list[Kind]) -> Kind:
    group, _, version = str(obj["apiVersion"]).rpartition("/")
    for kind in kinds:
        if kind.kind == obj["kind"] and kind.group == group:
            return kind.model_copy(update={"version": version or kind.version})
    raise EditError(f"This cluster does not serve {obj['kind']} ({obj['apiVersion']})")


def apply(
    api: ApiClient,
    kind: Kind,
    obj: dict[str, Any],
    namespace: str | None,
    existing: str | None,
    dry_run: bool,
) -> ApplyResult:
    """Replace ``existing`` (an edit) or create the object. ``dry_run`` validates only."""
    if is_secret(kind.group, kind.resource):
        raise EditError("Secrets are not edited in KubeiQ, so their values are never read")
    meta = obj.setdefault("metadata", {})
    if kind.namespaced:
        namespace = meta.get("namespace") or namespace or "default"
        meta["namespace"] = namespace
    else:
        namespace = None
        meta.pop("namespace", None)
    name = str(meta["name"])
    if existing is not None and existing != name:
        raise EditError("The name cannot change. Create a new object instead")
    meta.pop("managedFields", None)
    query = [("dryRun", "All")] if dry_run else []
    if existing is not None:
        path = resource_path(kind.group, kind.version, kind.resource, namespace, name)
        result = request(api, "PUT", path, query=query, body=obj, content_type="application/json")
    else:
        path = resource_path(kind.group, kind.version, kind.resource, namespace)
        result = request(api, "POST", path, query=query, body=obj, content_type="application/json")
    cleaned = clean(result, False)
    text = yaml.safe_dump(cleaned, sort_keys=False, allow_unicode=True, width=120)
    return ApplyResult(
        yaml=text,
        object=cleaned,
        name=name,
        namespace=namespace,
        created=existing is None,
        dry_run=dry_run,
    )
