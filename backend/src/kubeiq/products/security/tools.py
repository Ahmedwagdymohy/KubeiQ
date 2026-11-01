"""The scanners Cluster Security runs (ADR 0016): pinned versions, checksum-verified installs.

KubeiQ downloads each scanner once into ``<data_dir>/scanners`` the first time a scan needs it,
checks the archive against the SHA-256 pinned here and keeps only the binary. An admin can point
at preinstalled binaries instead (``KUBEIQ_TRIVY_PATH``, ``KUBEIQ_KUBESCAPE_PATH``), for
air-gapped installs. A scanner on PATH is never used: its version and output format are unknown.
"""

import hashlib
import io
import os
import platform
import sys
import tarfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import httpx

from kubeiq.core.config import get_settings

ToolName = Literal["trivy", "kubescape"]
TOOLS: tuple[ToolName, ...] = ("trivy", "kubescape")


@dataclass(frozen=True)
class Asset:
    url: str
    sha256: str


@dataclass(frozen=True)
class Tool:
    name: ToolName
    version: str
    binary: str
    assets: dict[str, Asset]  # "<os>-<arch>" -> archive


_TRIVY = "https://github.com/aquasecurity/trivy/releases/download/v0.75.0/trivy_0.75.0_"
_KUBESCAPE = "https://github.com/kubescape/kubescape/releases/download/v4.0.15/kubescape_4.0.15_"

REGISTRY: dict[ToolName, Tool] = {
    "trivy": Tool(
        "trivy",
        "0.75.0",
        "trivy",
        {
            "linux-amd64": Asset(
                _TRIVY + "Linux-64bit.tar.gz",
                "c6e65abddb348e25f10549df887045629cf28cc72453cd1c63acb717316b3f3f",
            ),
            "linux-arm64": Asset(
                _TRIVY + "Linux-ARM64.tar.gz",
                "a1ee9f6ffb7d112b64ff726a2a0717c21175c1114361391f4a132956751a13b3",
            ),
            "darwin-amd64": Asset(
                _TRIVY + "macOS-64bit.tar.gz",
                "291edaa9778acbe4693d067b5ad60ee11570e5ac68296e85595417528ca641e4",
            ),
            "darwin-arm64": Asset(
                _TRIVY + "macOS-ARM64.tar.gz",
                "4a77108cccf8e55c8d6823e1e759939a622277e66cd0daa3c1fc621ed69e4568",
            ),
        },
    ),
    "kubescape": Tool(
        "kubescape",
        "4.0.15",
        "kubescape",
        {
            "linux-amd64": Asset(
                _KUBESCAPE + "linux_amd64.tar.gz",
                "6c9fd51bcdcd1093d19383ef20e1c58c2bf83c9026073f8dcc786680ed2a0093",
            ),
            "linux-arm64": Asset(
                _KUBESCAPE + "linux_arm64.tar.gz",
                "416326e66c5d6cd5a542fceb912072e7c5dc2bb313d6c35d5dd13ff8fc26d31d",
            ),
            "darwin-amd64": Asset(
                _KUBESCAPE + "darwin_amd64.tar.gz",
                "b1156cf76b6f8ab42558dbcf01d79a928991b47dae9aae4077610ad6ff54e961",
            ),
            "darwin-arm64": Asset(
                _KUBESCAPE + "darwin_arm64.tar.gz",
                "73d7fa93c3071b7cb137e4e56f1be56290d1d83dc3fcb191214d670515aea499",
            ),
        },
    ),
}


class ToolError(RuntimeError):
    pass


def platform_key() -> str:
    machine = platform.machine().lower()
    arch = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(
        machine, machine
    )
    return f"{'darwin' if sys.platform == 'darwin' else 'linux'}-{arch}"


def home() -> Path:
    return Path(get_settings().data_dir) / "scanners"


def override(name: ToolName) -> str | None:
    settings = get_settings()
    return settings.trivy_path if name == "trivy" else settings.kubescape_path


def installed_path(name: ToolName) -> Path:
    tool = REGISTRY[name]
    return home() / f"{name}-{tool.version}" / tool.binary


def resolve(name: ToolName) -> Path | None:
    """The binary to run, or None when it still has to be installed."""
    if custom := override(name):
        path = Path(custom)
        if not path.is_file():
            raise ToolError(f"{name} is set to {custom}, which does not exist")
        return path
    path = installed_path(name)
    return path if path.is_file() else None


def extract(name: ToolName, archive: bytes, sha256: str) -> bytes:
    """The scanner's binary from a downloaded archive, after checking the archive's digest."""
    digest = hashlib.sha256(archive).hexdigest()
    if digest != sha256:
        raise ToolError(f"The {name} download does not match its pinned checksum")
    binary = REGISTRY[name].binary
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for member in tar.getmembers():
            if member.isfile() and member.name.rsplit("/", 1)[-1] == binary:
                data = tar.extractfile(member)
                if data is not None:
                    return data.read()
    raise ToolError(f"The {name} download has no {binary} binary")


async def install(name: ToolName, client: httpx.AsyncClient | None = None) -> Path:
    """Download, verify and install one scanner. Safe to call when it is already there."""
    if (path := resolve(name)) is not None:
        return path
    tool = REGISTRY[name]
    asset = tool.assets.get(platform_key())
    if asset is None:
        raise ToolError(f"{name} has no build for {platform_key()}")
    own = client is None
    http = client or httpx.AsyncClient(follow_redirects=True, timeout=600)
    try:
        response = await http.get(asset.url)
        response.raise_for_status()
        archive = response.content
    except httpx.HTTPError as exc:
        raise ToolError(f"Could not download {name}: {exc}") from exc
    finally:
        if own:
            await http.aclose()
    binary = extract(name, archive, asset.sha256)
    target = installed_path(name)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(".partial")
    partial.write_bytes(binary)
    os.chmod(partial, 0o700)  # only KubeiQ's own user runs it
    partial.replace(target)
    return target
