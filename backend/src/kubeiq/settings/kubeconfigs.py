"""Validate kubeconfig files before they are saved."""

from typing import Any

import yaml

FLATTEN_HINT = "kubectl config view --minify --flatten --context=<context>"


class InvalidKubeconfigError(ValueError):
    pass


def inspect(content: str) -> tuple[dict[str, Any], list[str], list[str]]:
    """Return (config, context names, warnings). Raises InvalidKubeconfigError."""
    try:
        config = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise InvalidKubeconfigError(f"Not valid YAML: {str(exc).splitlines()[0]}") from exc
    if not isinstance(config, dict) or config.get("kind", "Config") != "Config":
        raise InvalidKubeconfigError("Not a kubeconfig file (kind: Config)")
    contexts = [c.get("name") for c in config.get("contexts") or [] if c.get("name")]
    if not contexts:
        raise InvalidKubeconfigError("The file has no contexts")

    warnings: list[str] = []
    for user in config.get("users") or []:
        auth = user.get("user") or {}
        name = user.get("name", "user")
        if auth.get("exec"):
            command = auth["exec"].get("command", "a CLI")
            warnings.append(
                f"User {name} logs in with '{command}', which KubeiQ cannot run. Create a "
                "read-only kubeconfig with the connect command shown under Add Cluster"
            )
        if auth.get("auth-provider"):
            warnings.append(f"User {name} uses a legacy auth-provider plugin, which may not work")
        for field in ("client-certificate", "client-key", "token-file"):
            if auth.get(field):
                warnings.append(
                    f"User {name} points to a file ({field}). Embed it with: {FLATTEN_HINT}"
                )
    for cluster in config.get("clusters") or []:
        if (cluster.get("cluster") or {}).get("certificate-authority"):
            warnings.append(
                f"Cluster {cluster.get('name')} points to a CA file. Embed it with: {FLATTEN_HINT}"
            )
    return config, contexts, warnings
