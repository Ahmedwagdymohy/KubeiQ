"""Cluster source for Google Kubernetes Engine (ADR 0011).

KubeiQ uses the Google identity of the machine it runs on (on a Google Cloud VM, the VM's
service account, from the metadata server). No key is stored: the GKE API lists the clusters of
the configured projects, and every request to a cluster carries a short-lived access token.
"""

import base64
import hashlib
import tempfile
import threading
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, cast

import google.auth
import requests
from google.auth.credentials import Credentials
from google.auth.exceptions import DefaultCredentialsError, GoogleAuthError
from google.auth.transport.requests import AuthorizedSession, Request
from kubernetes.client import ApiClient, Configuration
from loguru import logger
from pydantic import BaseModel, Field
from requests import RequestException

from kubeiq.clusters.base import ClusterInfo, ClusterNotFoundError, ClusterSource, ConnectionMethod

CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform"
GKE_API = "https://container.googleapis.com/v1"

NO_IDENTITY = (
    "No Google Cloud identity found. Run KubeiQ on a Google Cloud VM with a service account, "
    "or connect the clusters with a kubeconfig instead"
)
NO_SCOPE = (
    "This VM's Cloud API access does not include the GKE API. Stop the VM, set Cloud API access "
    "to Allow full access to all Cloud APIs, and start it again"
)


class GkeProject(BaseModel):
    project_id: str = Field(pattern=r"^[a-z][a-z0-9-]{4,28}[a-z0-9]$")
    # Use the private endpoint: KubeiQ runs in the cluster's VPC (or a peered one).
    internal_ip: bool = False


class GceVm(BaseModel):
    """The Google Cloud VM KubeiQ runs on, to fill in the commands that set its service account."""

    name: str
    zone: str
    project_id: str


class GkeIdentity(BaseModel):
    email: str | None = None
    error: str | None = None
    vm: GceVm | None = None


class GkeProjectStatus(GkeProject):
    clusters: int = 0
    error: str | None = None


class GkeError(Exception):
    """A problem a user can fix (permissions, scopes, a wrong project), with what to do."""


class HttpSession(Protocol):
    def get(self, url: str, timeout: float) -> Any: ...


@dataclass(frozen=True)
class _Cluster:
    id: str
    name: str
    project: str
    location: str
    server: str
    ca: bytes


def _read_metadata() -> dict[str, Any] | None:
    """The VM's metadata, or None off Google Cloud. One quick request, no retries."""
    try:
        response = requests.get(
            "http://169.254.169.254/computeMetadata/v1/?recursive=true",
            headers={"Metadata-Flavor": "Google"},
            timeout=1,
        )
        data: dict[str, Any] = response.json() if response.ok else {}
    except (RequestException, ValueError):
        return None
    return data or None


def _authorized_session(credentials: Credentials) -> HttpSession:
    return cast(HttpSession, AuthorizedSession(credentials))  # type: ignore[no-untyped-call]


def _default_credentials() -> Credentials:
    credentials, _ = google.auth.default(scopes=[CLOUD_PLATFORM])
    return credentials


class GkeSource(ClusterSource):
    method = ConnectionMethod.GKE

    def __init__(
        self,
        credentials: Callable[[], Credentials] = _default_credentials,
        session: Callable[[Credentials], HttpSession] | None = None,
        metadata: Callable[[], dict[str, Any] | None] = _read_metadata,
    ) -> None:
        self._credentials_factory = credentials
        self._session_factory = session or _authorized_session
        self._metadata = metadata
        self._vm: GceVm | None = None
        self._vm_checked = False
        self._credentials: Credentials | None = None
        self._lock = threading.Lock()
        self._token_lock = threading.Lock()
        self._projects: list[GkeProject] = []
        self._clusters: dict[str, _Cluster] = {}
        self._errors: dict[str, str] = {}
        self._clients: dict[str, ApiClient] = {}
        self._ca_dir = Path(tempfile.mkdtemp(prefix="kubeiq-gke-"))

    @property
    def projects(self) -> list[GkeProject]:
        return list(self._projects)

    def set_projects(self, projects: list[GkeProject]) -> None:
        ids = {p.project_id for p in projects}
        with self._lock:
            self._projects = list(projects)
            self._clusters = {k: c for k, c in self._clusters.items() if c.project in ids}
            self._errors = {k: e for k, e in self._errors.items() if k in ids}
            self._clients.clear()

    def list_clusters(self) -> list[ClusterInfo]:
        return [
            ClusterInfo(id=c.id, name=c.name, method=self.method, server=f"https://{c.server}")
            for c in self._clusters.values()
        ]

    def api_client(self, cluster_id: str) -> ApiClient:
        cluster = self._clusters.get(cluster_id)
        if cluster is None:
            raise ClusterNotFoundError(cluster_id)
        with self._lock:
            if cluster_id not in self._clients:
                self._clients[cluster_id] = self._build_client(cluster)
            return self._clients[cluster_id]

    # Blocking calls to Google below: run them in a thread.

    def identity(self) -> GkeIdentity:
        """Which Google account KubeiQ runs as, whether it can call the GKE API, and its VM."""
        vm = self.vm()
        try:
            credentials = self._get_credentials()
            self._refresh(credentials)
        except GkeError as exc:
            return GkeIdentity(error=str(exc), vm=vm)
        email, scopes = _vm_service_account(credentials)
        email = email or getattr(credentials, "service_account_email", None)
        if scopes is not None and CLOUD_PLATFORM not in scopes:
            return GkeIdentity(email=email, error=NO_SCOPE, vm=vm)
        return GkeIdentity(email=email, vm=vm)

    def vm(self) -> GceVm | None:
        """Read once: a VM's name, zone and project do not change while KubeiQ runs."""
        if not self._vm_checked:
            self._vm_checked = True
            data = self._metadata() or {}
            instance, project = data.get("instance") or {}, data.get("project") or {}
            if instance.get("name") and instance.get("zone") and project.get("projectId"):
                self._vm = GceVm(
                    name=instance["name"],
                    zone=str(instance["zone"]).rsplit("/", 1)[-1],
                    project_id=project["projectId"],
                )
        return self._vm

    def discover(self) -> None:
        """List the clusters of every configured project through the GKE API."""
        clusters: dict[str, _Cluster] = {}
        errors: dict[str, str] = {}
        for project in self._projects:
            try:
                for item in self._list(project.project_id):
                    cluster = self._parse(project, item)
                    if cluster:
                        clusters[cluster.id] = cluster
            except GkeError as exc:
                errors[project.project_id] = str(exc)
                logger.warning("GKE discovery failed for {}: {}", project.project_id, exc)
        with self._lock:
            self._clusters, self._errors = clusters, errors
            self._clients.clear()

    def status(self) -> list[GkeProjectStatus]:
        return [
            GkeProjectStatus(
                **project.model_dump(),
                clusters=sum(c.project == project.project_id for c in self._clusters.values()),
                error=self._errors.get(project.project_id),
            )
            for project in self._projects
        ]

    def _get_credentials(self) -> Credentials:
        if self._credentials is None:
            try:
                self._credentials = self._credentials_factory()
            except DefaultCredentialsError as exc:
                raise GkeError(NO_IDENTITY) from exc
        return self._credentials

    def _refresh(self, credentials: Credentials) -> None:
        with self._token_lock:
            if credentials.valid:
                return
            try:
                credentials.refresh(Request())  # type: ignore[no-untyped-call]
            except GoogleAuthError as exc:
                raise GkeError(f"Could not get a Google access token: {exc}") from exc

    def _list(self, project_id: str) -> list[dict[str, Any]]:
        session = self._session_factory(self._get_credentials())
        url = f"{GKE_API}/projects/{project_id}/locations/-/clusters"
        try:
            response = session.get(url, timeout=15)
        except GoogleAuthError as exc:
            raise GkeError(f"Could not get a Google access token: {exc}") from exc
        except RequestException as exc:
            raise GkeError(f"Could not reach the GKE API: {exc}") from exc
        if response.status_code != 200:
            raise GkeError(self._describe(response, project_id))
        clusters: list[dict[str, Any]] = response.json().get("clusters") or []
        return clusters

    def _describe(self, response: Any, project_id: str) -> str:
        try:
            error = response.json().get("error") or {}
        except ValueError:
            error = {}
        reasons = {d.get("reason") for d in error.get("details") or [] if isinstance(d, dict)}
        message = error.get("message") or response.reason or "unknown error"
        if response.status_code == 403:
            if (
                "ACCESS_TOKEN_SCOPE_INSUFFICIENT" in reasons
                or "insufficient authentication scopes" in message
            ):
                return NO_SCOPE
            if "SERVICE_DISABLED" in reasons:
                return f"The Kubernetes Engine API is not enabled in project {project_id}"
            email = (
                getattr(self._credentials, "service_account_email", None)
                or "KubeiQ's service account"
            )
            return (
                f"{email} needs the role Kubernetes Engine Cluster Viewer "
                f"(roles/container.clusterViewer) on project {project_id}"
            )
        if response.status_code == 404:
            return f"Project {project_id} was not found"
        return f"GKE API error ({response.status_code}): {message}"

    def _parse(self, project: GkeProject, item: dict[str, Any]) -> _Cluster | None:
        endpoint = item.get("endpoint")
        if project.internal_ip:
            endpoint = (item.get("privateClusterConfig") or {}).get("privateEndpoint") or endpoint
        ca = (item.get("masterAuth") or {}).get("clusterCaCertificate")
        if not endpoint or not ca:
            return None  # still provisioning
        location = item.get("location", "")
        return _Cluster(
            id=self.make_id(f"{project.project_id}/{location}/{item['name']}"),
            name=item["name"],
            project=project.project_id,
            location=location,
            server=endpoint,
            ca=base64.b64decode(ca),
        )

    def _build_client(self, cluster: _Cluster) -> ApiClient:
        ca_file = self._ca_dir / f"{hashlib.sha256(cluster.id.encode()).hexdigest()[:16]}.crt"
        ca_file.write_bytes(cluster.ca)
        configuration = Configuration()
        configuration.host = f"https://{cluster.server}"
        configuration.ssl_ca_cert = str(ca_file)
        configuration.api_key_prefix["authorization"] = "Bearer"
        configuration.api_key["authorization"] = ""
        # Called before every request: refresh the short-lived token when it expires.
        configuration.refresh_api_key_hook = self._set_token  # type: ignore[assignment]
        return ApiClient(configuration)

    def _set_token(self, configuration: Configuration) -> None:
        credentials = self._get_credentials()
        self._refresh(credentials)
        configuration.api_key["authorization"] = credentials.token or ""


def _vm_service_account(credentials: Credentials) -> tuple[str | None, list[str] | None]:
    """On a Google Cloud VM: the service account email and the VM's access scopes."""
    from google.auth import compute_engine
    from google.auth.compute_engine import _metadata

    if not isinstance(credentials, compute_engine.Credentials):
        return None, None
    try:
        info = _metadata.get_service_account_info(Request())  # type: ignore[no-untyped-call]
    except GoogleAuthError:
        return None, None
    return info.get("email"), info.get("scopes")
