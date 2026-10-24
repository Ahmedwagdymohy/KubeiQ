"""Cluster source backed by a local kubeconfig file (one cluster per context)."""

import os
import threading
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import yaml
from kubernetes import config as k8s_config
from kubernetes.client import ApiClient, Configuration
from loguru import logger

from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterSource, ConnectionMethod

_LOCAL_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0", "::1"}  # noqa: S104 - matched, not bound


class KubeconfigSource(ClusterSource):
    method = ConnectionMethod.KUBECONFIG

    def __init__(self, path: str | None = None, localhost_alias: str | None = None) -> None:
        """
        Args:
            path: kubeconfig file. Defaults to ``$KUBECONFIG`` or ``~/.kube/config``.
            localhost_alias: when running in a container, rewrite API servers on
                ``127.0.0.1``/``localhost`` (kind, minikube, k3d) to this host, e.g.
                ``host.docker.internal``. TLS still verifies against the original name.
        """
        self._path = path or os.environ.get("KUBECONFIG", "").split(os.pathsep)[0] or None
        self._localhost_alias = localhost_alias
        self._lock = threading.Lock()
        self._mtime: float | None = None
        self._contexts: dict[str, dict[str, Any]] = {}
        self._servers: dict[str, str] = {}
        self._default: str | None = None
        self._clients: dict[str, ApiClient] = {}
        self._error: str | None = None

    @property
    def path(self) -> Path:
        return Path(self._path or k8s_config.kube_config.KUBE_CONFIG_DEFAULT_LOCATION).expanduser()

    @property
    def error(self) -> str | None:
        """Why the file could not be read (for example, permissions), or None."""
        self._reload_if_changed()
        return self._error

    def list_clusters(self) -> list[ClusterInfo]:
        self._reload_if_changed()
        return [
            ClusterInfo(
                id=self.make_id(name),
                name=name,
                method=self.method,
                server=self._servers.get(name),
                namespace=ctx.get("context", {}).get("namespace"),
                is_default=name == self._default,
            )
            for name, ctx in self._contexts.items()
        ]

    def api_client(self, cluster_id: str) -> ApiClient:
        self._reload_if_changed()
        name = cluster_id.removeprefix(f"{self.method.value}:")
        if not cluster_id.startswith(f"{self.method.value}:") or name not in self._contexts:
            raise ClusterNotFoundError(cluster_id)
        with self._lock:
            if name not in self._clients:
                self._clients[name] = self._build_client(name)
            return self._clients[name]

    def _build_client(self, context: str) -> ApiClient:
        configuration = Configuration()
        k8s_config.load_kube_config(
            config_file=str(self.path), context=context, client_configuration=configuration
        )
        if self._localhost_alias:
            self._apply_localhost_alias(configuration, self._localhost_alias)
        return ApiClient(configuration)

    @staticmethod
    def _apply_localhost_alias(configuration: Configuration, alias: str) -> None:
        parts = urlsplit(configuration.host)
        if parts.hostname not in _LOCAL_HOSTS:
            return
        netloc = alias + (f":{parts.port}" if parts.port else "")
        configuration.host = urlunsplit(parts._replace(netloc=netloc))
        # Certificates for local clusters are issued for localhost / 127.0.0.1.
        configuration.tls_server_name = "localhost"

    def _reload_if_changed(self) -> None:
        path = self.path
        try:
            mtime = path.stat().st_mtime
        except FileNotFoundError:
            if self._contexts:
                logger.warning("Kubeconfig {} no longer exists", path)
            self._reset(None)
            self._error = None
            return
        except OSError as exc:
            # Usually permissions: the file belongs to another user than the one KubeiQ runs as.
            self._fail(f"Cannot read {path}: {exc.strerror or exc}", None)
            return
        if mtime == self._mtime:
            return
        with self._lock:
            try:
                contexts, current = k8s_config.list_kube_config_contexts(config_file=str(path))
                raw = yaml.safe_load(path.read_text()) or {}
                clusters = {c["name"]: c.get("cluster", {}) for c in raw.get("clusters") or []}
            except Exception as exc:
                self._fail(f"Cannot read {path}: {getattr(exc, 'strerror', None) or exc}", mtime)
                return
            self._contexts = {c["name"]: c for c in contexts}
            self._servers = {
                name: clusters.get(ctx["context"].get("cluster"), {}).get("server")
                for name, ctx in self._contexts.items()
            }
            self._default = current["name"] if current else None
            self._clients.clear()
            self._mtime = mtime
            self._error = None
            logger.info("Loaded {} context(s) from {}", len(self._contexts), path)

    def _fail(self, error: str, mtime: float | None) -> None:
        if error != self._error:
            logger.error(error)
        self._reset(mtime)
        self._error = error

    def _reset(self, mtime: float | None) -> None:
        self._contexts, self._servers, self._clients = {}, {}, {}
        self._default = None
        self._mtime = mtime
