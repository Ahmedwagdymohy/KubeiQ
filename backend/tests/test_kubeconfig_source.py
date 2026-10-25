import os
from pathlib import Path

import pytest
import yaml

from kubeiq.clusters.base import ClusterNotFoundError, ConnectionMethod
from kubeiq.clusters.kubeconfig import KubeconfigSource


def write_kubeconfig(path: Path, contexts: dict[str, str], current: str) -> Path:
    path.write_text(
        yaml.safe_dump(
            {
                "apiVersion": "v1",
                "kind": "Config",
                "current-context": current,
                "clusters": [
                    {"name": name, "cluster": {"server": server, "insecure-skip-tls-verify": True}}
                    for name, server in contexts.items()
                ],
                "users": [{"name": "dev", "user": {"token": "test-token"}}],
                "contexts": [
                    {"name": name, "context": {"cluster": name, "user": "dev", "namespace": "apps"}}
                    for name in contexts
                ],
            }
        )
    )
    return path


@pytest.fixture
def kubeconfig(tmp_path: Path) -> Path:
    return write_kubeconfig(
        tmp_path / "config",
        {"kind-dev": "https://127.0.0.1:6443", "prod": "https://prod.example.com:443"},
        current="prod",
    )


def test_lists_contexts_as_clusters(kubeconfig: Path) -> None:
    clusters = {c.name: c for c in KubeconfigSource(str(kubeconfig)).list_clusters()}

    assert set(clusters) == {"kind-dev", "prod"}
    assert clusters["prod"].id == "kubeconfig:prod"
    assert clusters["prod"].method is ConnectionMethod.KUBECONFIG
    assert clusters["prod"].server == "https://prod.example.com:443"
    assert clusters["prod"].namespace == "apps"
    assert clusters["prod"].is_default
    assert not clusters["kind-dev"].is_default


def test_missing_kubeconfig_returns_no_clusters(tmp_path: Path) -> None:
    assert KubeconfigSource(str(tmp_path / "absent")).list_clusters() == []


def test_unknown_cluster_raises(kubeconfig: Path) -> None:
    with pytest.raises(ClusterNotFoundError):
        KubeconfigSource(str(kubeconfig)).api_client("kubeconfig:nope")


def test_localhost_alias_rewrites_local_servers_only(kubeconfig: Path) -> None:
    source = KubeconfigSource(str(kubeconfig), localhost_alias="host.docker.internal")

    local = source.api_client("kubeconfig:kind-dev").configuration
    remote = source.api_client("kubeconfig:prod").configuration

    assert local.host == "https://host.docker.internal:6443"
    assert local.tls_server_name == "localhost"
    assert remote.host == "https://prod.example.com:443"


def test_reloads_when_file_changes(kubeconfig: Path) -> None:
    source = KubeconfigSource(str(kubeconfig))
    assert len(source.list_clusters()) == 2

    write_kubeconfig(kubeconfig, {"staging": "https://staging.example.com"}, current="staging")
    stat = kubeconfig.stat()
    os.utime(kubeconfig, (stat.st_atime, stat.st_mtime + 5))

    assert [c.name for c in source.list_clusters()] == ["staging"]


@pytest.mark.skipif(os.geteuid() == 0, reason="root reads any file")
def test_unreadable_kubeconfig_reports_error_instead_of_failing(tmp_path: Path) -> None:
    folder = tmp_path / ".kube"
    folder.mkdir()
    path = write_kubeconfig(folder / "config", {"dev": "https://10.0.0.1:6443"}, "dev")
    source = KubeconfigSource(str(path))
    folder.chmod(0o000)  # like a ~/.kube that belongs to another user
    try:
        assert source.list_clusters() == []
        assert source.error is not None and "Permission denied" in source.error
    finally:
        folder.chmod(0o700)
    assert [c.name for c in source.list_clusters()] == ["dev"]
    assert source.error is None
