"""Raw Kubernetes API access for any resource kind, with strict path validation."""

import json
import re
from collections.abc import Iterator
from typing import Any
from urllib.parse import quote

from kubernetes.client import ApiClient
from kubernetes.client.exceptions import ApiException

from kubeiq.core.k8s import REQUEST_TIMEOUT

TABLE = "application/json;as=Table;v=v1;g=meta.k8s.io,application/json"
METADATA_ONLY = "application/json;as=PartialObjectMetadata;v=v1;g=meta.k8s.io,application/json"
METADATA_LIST = "application/json;as=PartialObjectMetadataList;v=v1;g=meta.k8s.io,application/json"

_GROUP = re.compile(r"^[a-z0-9.-]*$")
_VERSION = re.compile(r"^v[0-9]+[a-z0-9]*$")
_RESOURCE = re.compile(r"^[a-z0-9.-]+$")
_NAME = re.compile(r"^[A-Za-z0-9._:@-]+$")


class InvalidPathError(ValueError):
    pass


def _check(pattern: re.Pattern[str], value: str, what: str) -> str:
    if not pattern.fullmatch(value):
        raise InvalidPathError(f"Invalid {what}: {value!r}")
    return value


def resource_path(
    group: str, version: str, resource: str, namespace: str | None = None, name: str | None = None
) -> str:
    _check(_GROUP, group, "API group")
    _check(_VERSION, version, "API version")
    _check(_RESOURCE, resource, "resource")
    path = f"/api/{version}" if not group else f"/apis/{group}/{version}"
    if namespace:
        path += f"/namespaces/{quote(_check(_NAME, namespace, 'namespace'))}"
    path += f"/{resource}"
    if name:
        path += f"/{quote(_check(_NAME, name, 'name'))}"
    return path


def request(
    api: ApiClient,
    method: str,
    path: str,
    *,
    query: list[tuple[str, Any]] | None = None,
    accept: str = "application/json",
    body: Any = None,
    content_type: str | None = None,
    raw: bool = False,
) -> Any:
    headers = {"Accept": accept}
    if content_type:
        headers["Content-Type"] = content_type
    method, url, headers, payload, _ = api.param_serialize(
        method=method,
        resource_path=path,
        query_params=query or [],
        header_params=headers,
        body=body,
        auth_settings=["BearerToken"],
    )
    response = api.call_api(
        method, url, header_params=headers, body=payload, _request_timeout=REQUEST_TIMEOUT
    )
    data: bytes = response.read() or b""
    if not 200 <= response.status < 300:
        raise ApiException(
            status=response.status, reason=response.reason, body=data.decode(errors="replace")
        )
    if raw:
        return data.decode("utf-8", errors="replace")
    return json.loads(data) if data else None


def open_stream(
    api: ApiClient,
    path: str,
    *,
    query: list[tuple[str, Any]] | None = None,
    accept: str = "application/json",
    read_timeout: float = 330,
) -> Any:
    """An open streaming response (a watch, followed logs). Call ``.release_conn()`` when done."""
    method, url, headers, _body, _ = api.param_serialize(
        method="GET",
        resource_path=path,
        query_params=query or [],
        header_params={"Accept": accept},
        auth_settings=["BearerToken"],
    )
    response = api.call_api(method, url, header_params=headers, _request_timeout=(10, read_timeout))
    raw = response.response  # urllib3, not read yet
    if not 200 <= response.status < 300:
        body = raw.read().decode(errors="replace")
        raise ApiException(status=response.status, reason=response.reason, body=body)
    return raw


def lines(raw: Any) -> Iterator[bytes]:
    """Newline-separated chunks of a streaming response, as they arrive."""
    buffer = b""
    for chunk in raw.stream(4096, decode_content=True):
        buffer += chunk
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            if line.strip():
                yield line
    if buffer.strip():
        yield buffer
