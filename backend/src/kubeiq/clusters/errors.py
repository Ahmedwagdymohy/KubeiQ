"""Turn Kubernetes client exceptions into short messages users can act on."""

import errno
import socket
import ssl
from urllib.parse import urlsplit

from kubernetes.client.exceptions import ApiException
from kubernetes.config.config_exception import ConfigException
from urllib3.exceptions import (
    ConnectTimeoutError,
    MaxRetryError,
    NameResolutionError,
    NewConnectionError,
    ReadTimeoutError,
    SSLError,
)
from urllib3.exceptions import HTTPError as Urllib3Error

UNREACHABLE = "Cluster unreachable. Check the API server address, VPN or network access"


def describe_error(exc: Exception, server: str | None = None) -> str:
    """With ``server`` (the API server URL), network errors name the address and likely cause."""
    if isinstance(exc, ApiException):
        if exc.status == 401:
            return "Authentication failed. Check the credentials for this cluster"
        if exc.status == 403:
            return "Access denied. The user or service account lacks permission"
        return f"Kubernetes API error ({exc.status}): {exc.reason}"
    if isinstance(exc, ConfigException):
        return f"Invalid kubeconfig: {exc}"
    if isinstance(exc, Urllib3Error | OSError):
        return _network(exc, server)
    return f"Unexpected error: {type(exc).__name__}"


def _network(exc: Exception, server: str | None) -> str:
    reason: BaseException = exc
    if isinstance(exc, MaxRetryError) and exc.reason is not None:
        reason = exc.reason
    parts = urlsplit(server) if server else None
    host = parts.hostname if parts else None
    address = f"{host}:{parts.port or 443}" if parts and host else "The API server"

    if isinstance(reason, SSLError | ssl.SSLError):
        return (
            f"Certificate check failed for {address}. The kubeconfig's certificate authority "
            "does not match this address"
        )
    if isinstance(reason, NameResolutionError) or _caused_by(reason, socket.gaierror):
        return f"Cluster unreachable: {host or 'the API server name'} does not resolve from KubeiQ"
    # Before timeouts: urllib3's NewConnectionError is a subclass of its ConnectTimeoutError.
    if _errno(reason) == errno.ECONNREFUSED or "refused" in str(reason).lower():
        return f"Cluster unreachable: {address} refused the connection. Nothing listens there"
    timed_out = isinstance(reason, NewConnectionError) and "timed out" in str(reason).lower()
    if timed_out or isinstance(reason, ConnectTimeoutError | ReadTimeoutError | TimeoutError):
        return (
            f"Cluster unreachable: {address} does not answer. It may only be reachable from "
            "another network, such as a VPN, a private endpoint or a Docker network (minikube)"
        )
    return UNREACHABLE


def _caused_by(exc: BaseException, kind: type[BaseException]) -> bool:
    return any(isinstance(c, kind) for c in (exc, exc.__cause__, exc.__context__))


def _errno(exc: BaseException) -> int | None:
    """The OS error number of a connection failure, also when urllib3 wraps it."""
    for candidate in (exc, exc.__cause__, exc.__context__):
        if isinstance(candidate, OSError) and candidate.errno is not None:
            return candidate.errno
    return None
