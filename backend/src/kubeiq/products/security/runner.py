"""Run the scanners against one cluster (ADR 0016).

Each scanner runs as its own process with a throwaway home directory and a kubeconfig that
points at the read-only ``ScanProxy``: no real credentials on disk, no ~/.kube fallback, no
writes, no Secrets. Its JSON report is parsed into the common models.
"""

import asyncio
import json
import os
import tempfile
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import yaml
from kubernetes.client import ApiClient

from kubeiq.core.config import get_settings
from kubeiq.products.security import kubescape, tools, trivy
from kubeiq.products.security.models import ScanResult, ToolRun
from kubeiq.products.security.proxy import ScanProxy

Progress = Callable[[str], Awaitable[None]]
_ERROR_TAIL = 600


def cache_dir(name: tools.ToolName) -> Path:
    path = tools.home() / "cache" / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def trivy_command(binary: Path, kubeconfig: Path, output: Path, minutes: int) -> list[str]:
    return [
        str(binary),
        "k8s",
        "--kubeconfig",
        str(kubeconfig),
        "--format",
        "json",
        "--report",
        "all",
        "--scanners",
        "vuln,misconfig,rbac",
        "--disable-node-collector",  # it would start a Job on a node: a write
        "--exclude-owned",  # report on the Deployment, not each ReplicaSet and Pod
        "--exclude-kinds",
        "Secret",
        "--image-src",
        "remote",  # read images from their registries, never a local Docker daemon
        "--cache-dir",
        str(cache_dir("trivy")),
        "--timeout",
        f"{minutes}m",
        "--parallel",
        "3",
        "--quiet",
        "--output",
        str(output),
    ]


def kubescape_command(binary: Path, kubeconfig: Path, output: Path) -> list[str]:
    return [
        str(binary),
        "scan",
        "framework",
        ",".join(kubescape.FRAMEWORKS),
        "--kubeconfig",
        str(kubeconfig),
        "--format",
        "json",
        "--output",
        str(output),
        "--keep-local",  # never send results to a vendor's service
        "--exclude-kinds",
        "Secret",
        "--cache-dir",
        str(cache_dir("kubescape")),
        "--logger",
        "error",
    ]


async def run_process(command: list[str], env: dict[str, str], seconds: float) -> tuple[int, str]:
    process = await asyncio.create_subprocess_exec(
        *command,
        env=env,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(process.communicate(), timeout=seconds)
    except TimeoutError:
        process.kill()
        await process.wait()
        raise
    except asyncio.CancelledError:
        process.kill()
        await process.wait()
        raise
    return process.returncode or 0, stderr.decode(errors="replace")


def _error(stderr: str, code: int) -> str:
    lines = [line for line in stderr.strip().splitlines() if line.strip()]
    tail = " ".join(lines[-3:])[-_ERROR_TAIL:]
    return tail or f"exited with code {code}"


async def scan(
    api: ApiClient,
    cluster_name: str,
    which: tuple[tools.ToolName, ...],
    progress: Progress,
) -> tuple[list[ScanResult], list[ToolRun], dict[str, int]]:
    """Run each scanner in turn. One failing scanner does not stop the other."""
    minutes = get_settings().security_scan_minutes
    results: list[ScanResult] = []
    runs: list[ToolRun] = []
    with (
        tempfile.TemporaryDirectory(prefix="kubeiq-scan-") as folder,
        ScanProxy(api, cluster_name) as proxy,
    ):
        work = Path(folder)
        kubeconfig = work / "kubeconfig"
        kubeconfig.write_text(yaml.safe_dump(proxy.kubeconfig()))
        os.chmod(kubeconfig, 0o600)
        (work / "home").mkdir()
        env = {
            "PATH": "/usr/bin:/bin",
            "HOME": str(work / "home"),
            "KUBECONFIG": str(kubeconfig),
            "TMPDIR": str(work),
        }
        for name in which:
            tool = tools.REGISTRY[name]
            started = time.monotonic()
            try:
                binary = tools.resolve(name)
                if binary is None:
                    await progress(f"Installing {name} {tool.version}")
                    binary = await tools.install(name)
                await progress(
                    "Checking images for vulnerabilities and settings with Trivy"
                    if name == "trivy"
                    else "Checking the cluster against NSA, MITRE and CIS with Kubescape"
                )
                output = work / f"{name}.json"
                command = (
                    trivy_command(binary, kubeconfig, output, minutes)
                    if name == "trivy"
                    else kubescape_command(binary, kubeconfig, output)
                )
                code, stderr = await run_process(command, env, minutes * 60 + 60)
                if not output.is_file():
                    raise tools.ToolError(_error(stderr, code))
                report: dict[str, Any] = json.loads(output.read_text())
                results.append(
                    trivy.parse(report)
                    if name == "trivy"
                    else kubescape.parse(report, kubescape.control_texts(cache_dir("kubescape")))
                )
                runs.append(ToolRun(tool=name, version=tool.version, ok=True))
            except TimeoutError:
                runs.append(
                    ToolRun(
                        tool=name,
                        version=tool.version,
                        ok=False,
                        error=f"Took longer than {minutes} minutes",
                    )
                )
            except (tools.ToolError, OSError, ValueError) as exc:
                runs.append(ToolRun(tool=name, version=tool.version, ok=False, error=str(exc)))
            runs[-1].seconds = round(time.monotonic() - started, 1)
        refused = dict(proxy.refused)
    return results, runs, refused
