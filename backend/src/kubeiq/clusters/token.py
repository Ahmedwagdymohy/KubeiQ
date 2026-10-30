"""Cluster source for API server + ServiceAccount token connections, added in Settings.

The token is stored encrypted and decrypted in memory only. TLS is always verified: against the
CA bundle given with the cluster, or the system's trusted CAs. There is no switch to skip it.
"""

import base64
import threading
from typing import Any

from kubernetes.client import ApiClient
from pydantic import BaseModel, Field, field_validator

from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterSource, ConnectionMethod
from kubeiq.clusters.uploaded import UploadedKubeconfigSource
from kubeiq.settings.crypto import decrypt

NAME_PATTERN = r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"


class TokenClusterIn(BaseModel):
    name: str = Field(min_length=1, max_length=40, pattern=NAME_PATTERN)
    server: str = Field(min_length=8, max_length=512)
    # None keeps the saved token when editing; required when adding.
    token: str | None = Field(default=None, max_length=8192)
    ca: str | None = Field(default=None, max_length=32_000)  # PEM bundle; None: system CAs
    namespace: str | None = None
    project_id: str | None = None

    @field_validator("server")
    @classmethod
    def _https(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith("https://"):
            raise ValueError("The API server address starts with https://")
        return value

    @field_validator("ca")
    @classmethod
    def _pem(cls, value: str | None) -> str | None:
        value = (value or "").strip() or None
        if value and "BEGIN CERTIFICATE" not in value:
            raise ValueError(
                "The CA bundle is PEM text that starts with -----BEGIN CERTIFICATE-----"
            )
        return value

    @field_validator("token")
    @classmethod
    def _token(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


def kubeconfig_for(name: str, server: str, token: str, ca: str | None) -> dict[str, Any]:
    cluster: dict[str, Any] = {"server": server}
    if ca:
        cluster["certificate-authority-data"] = base64.b64encode(ca.encode()).decode()
    return {
        "apiVersion": "v1",
        "kind": "Config",
        "clusters": [{"name": name, "cluster": cluster}],
        "users": [{"name": name, "user": {"token": token}}],
        "contexts": [{"name": name, "context": {"cluster": name, "user": name}}],
        "current-context": name,
    }


class TokenSource(ClusterSource):
    method = ConnectionMethod.TOKEN

    def __init__(self, localhost_alias: str | None = None) -> None:
        self._builder = UploadedKubeconfigSource(localhost_alias)
        self._lock = threading.Lock()
        self._entries: dict[str, dict[str, Any]] = {}
        self._clients: dict[str, ApiClient] = {}

    def set_entries(self, entries: list[dict[str, Any]]) -> None:
        """Entries as stored: name, server, token (encrypted), ca, namespace, created_at."""
        with self._lock:
            self._entries = {e["name"]: e for e in entries}
            self._clients.clear()

    def entries(self) -> list[dict[str, Any]]:
        return list(self._entries.values())

    def list_clusters(self) -> list[ClusterInfo]:
        return [
            ClusterInfo(
                id=self.make_id(e["name"]),
                name=e["name"],
                method=self.method,
                server=e["server"],
                namespace=e.get("namespace"),
            )
            for e in self._entries.values()
        ]

    def client_for(self, name: str, server: str, token: str, ca: str | None) -> ApiClient:
        """A client before anything is saved, to test the connection."""
        return self._builder.client_for(kubeconfig_for(name, server, token, ca), name)

    def api_client(self, cluster_id: str) -> ApiClient:
        name = cluster_id.removeprefix(f"{self.method.value}:")
        entry = self._entries.get(name)
        if entry is None:
            raise ClusterNotFoundError(cluster_id)
        with self._lock:
            if cluster_id not in self._clients:
                self._clients[cluster_id] = self.client_for(
                    name, entry["server"], decrypt(entry["token"]), entry.get("ca")
                )
            return self._clients[cluster_id]
