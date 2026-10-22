"""Turn Kubernetes client exceptions into short messages users can act on."""

from kubernetes.client.exceptions import ApiException
from kubernetes.config.config_exception import ConfigException
from urllib3.exceptions import HTTPError as Urllib3Error


def describe_error(exc: Exception) -> str:
    if isinstance(exc, ApiException):
        if exc.status == 401:
            return "Authentication failed. Check the credentials for this cluster"
        if exc.status == 403:
            return "Access denied. The user or service account lacks permission"
        return f"Kubernetes API error ({exc.status}): {exc.reason}"
    if isinstance(exc, ConfigException):
        return f"Invalid kubeconfig: {exc}"
    if isinstance(exc, Urllib3Error | OSError):
        return "Cluster unreachable. Check the API server address, VPN or network access"
    return f"Unexpected error: {type(exc).__name__}"
