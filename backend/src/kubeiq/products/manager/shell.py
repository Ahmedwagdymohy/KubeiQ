"""Terminal and files in a container (ADR 0009: behind the switch, editors only, audited).

The shell is chosen inside the container: bash, else ash, else sh. Images without a shell
(distroless) get a clear message with the kubectl debug command instead.
"""

import base64
import re
from typing import Any

from kubernetes.client import ApiClient, CoreV1Api
from kubernetes.stream import stream
from pydantic import BaseModel

SHELL = [
    "/bin/sh",
    "-c",
    "if command -v bash >/dev/null 2>&1; then exec bash; "
    "elif command -v ash >/dev/null 2>&1; then exec ash; else exec sh; fi",
]
MAX_DOWNLOAD_BYTES = 10_000_000
MAX_ENTRIES = 1000
_PATH = re.compile(r"^/[^\0\n]*$")


class FileEntry(BaseModel):
    name: str
    directory: bool


class Listing(BaseModel):
    path: str
    entries: list[FileEntry]
    truncated: bool


class ShellError(RuntimeError):
    pass


def no_shell(pod: str, namespace: str, container: str) -> str:
    return (
        "This image has no shell (a distroless image). Start a debug container next to it: "
        f"kubectl debug -it {pod} -n {namespace} --image=busybox --target={container}"
    )


def open_shell(api: ApiClient, namespace: str, pod: str, container: str) -> Any:
    """An interactive TTY session (kubernetes WSClient)."""
    return stream(
        CoreV1Api(api).connect_get_namespaced_pod_exec,
        pod,
        namespace,
        container=container,
        command=SHELL,
        stdin=True,
        stdout=True,
        stderr=True,
        tty=True,
        _preload_content=False,
    )


def _run(api: ApiClient, namespace: str, pod: str, container: str, command: list[str]) -> str:
    client = stream(
        CoreV1Api(api).connect_get_namespaced_pod_exec,
        pod,
        namespace,
        container=container,
        command=command,
        stdin=False,
        stdout=True,
        stderr=True,
        tty=False,
        _preload_content=False,
    )
    out: list[str] = []
    err: list[str] = []
    size = 0
    while client.is_open():
        client.update(timeout=1)
        if client.peek_stdout():
            chunk = client.read_stdout()
            size += len(chunk)
            out.append(chunk)
            if size > MAX_DOWNLOAD_BYTES * 4 // 3 + 4096:
                client.close()
                raise ShellError("The file is larger than 10 MB")
        if client.peek_stderr():
            err.append(client.read_stderr())
    client.close()
    code = client.returncode
    if code not in (0, None):
        message = "".join(err).strip() or f"The command failed (exit code {code})"
        raise ShellError(message)
    return "".join(out)


def check_path(path: str) -> str:
    if not _PATH.fullmatch(path) or "/../" in f"{path}/":
        raise ShellError("Give an absolute path, such as /app")
    return path


def list_dir(api: ApiClient, namespace: str, pod: str, container: str, path: str) -> Listing:
    path = check_path(path)
    try:
        text = _run(api, namespace, pod, container, ["ls", "-1Ap", path])
    except ShellError as exc:
        if "executable file not found" in str(exc) or "no such file" in str(exc).lower():
            raise ShellError(no_shell(pod, namespace, container)) from exc
        raise
    names = [n for n in text.splitlines() if n]
    entries = [FileEntry(name=n.rstrip("/"), directory=n.endswith("/")) for n in names]
    entries.sort(key=lambda e: (not e.directory, e.name.lower()))
    return Listing(path=path, entries=entries[:MAX_ENTRIES], truncated=len(entries) > MAX_ENTRIES)


def read_file(api: ApiClient, namespace: str, pod: str, container: str, path: str) -> bytes:
    """The file's bytes, sent as base64 by the container so binary files survive."""
    path = check_path(path)
    text = _run(api, namespace, pod, container, ["base64", path])
    data = base64.b64decode("".join(text.split()))
    if len(data) > MAX_DOWNLOAD_BYTES:
        raise ShellError("The file is larger than 10 MB")
    return data
