"""Log collector: bounded, redacted excerpts for unhealthy containers only.

For a restarting container the *previous* run usually holds the crash, so both are fetched.
"""

import re

from kubernetes.client import ApiClient, CoreV1Api
from kubernetes.client.exceptions import ApiException

from kubeiq.collectors.models import ContainerSnapshot, LogExcerpt, PodSnapshot
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.security.redaction import redact

TAIL_LINES = 200
LIMIT_BYTES = 64 * 1024
KEEP_TAIL = 50
MAX_LINES = 120
MAX_LINE_LENGTH = 500
MAX_PODS = 10

_INTERESTING = re.compile(
    r"(?i)\b(error|exception|fatal|panic|traceback|failed|refused|denied|timeout|"
    r"not found|missing|invalid|cannot|unable|killed|oom)\b"
)


def collect(api: ApiClient, pods: list[PodSnapshot]) -> list[LogExcerpt]:
    core = CoreV1Api(api)
    excerpts: list[LogExcerpt] = []
    for pod in [p for p in pods if p.unhealthy][:MAX_PODS]:
        for container in pod.containers:
            for previous in targets(container):
                excerpts.append(_fetch(core, pod, container.name, previous))
    return excerpts


def targets(container: ContainerSnapshot) -> list[bool]:
    """Which runs to read: current (False) and/or previous (True)."""
    runs = []
    never_started = container.state == "waiting" and container.restart_count == 0
    if not never_started and not (container.ready and container.restart_count == 0):
        runs.append(False)
    if container.restart_count > 0:
        runs.append(True)
    return runs


def _fetch(core: CoreV1Api, pod: PodSnapshot, container: str, previous: bool) -> LogExcerpt:
    excerpt = LogExcerpt(
        ref=f"{pod.ref}/{container}", pod=pod.ref, container=container, previous=previous
    )
    try:
        raw = core.read_namespaced_pod_log(
            pod.name,
            pod.namespace,
            container=container,
            previous=previous,
            tail_lines=TAIL_LINES,
            limit_bytes=LIMIT_BYTES,
            _request_timeout=REQUEST_TIMEOUT,
        )
    except ApiException as exc:
        excerpt.error = f"{exc.status} {exc.reason}"
        return excerpt
    excerpt.lines, excerpt.truncated = condense((raw or "").splitlines())
    return excerpt


def condense(lines: list[str]) -> tuple[list[str], bool]:
    """Keep error-looking lines plus the tail, in original order, redacted and capped."""
    tail_start = max(len(lines) - KEEP_TAIL, 0)
    keep = [i for i, line in enumerate(lines) if i >= tail_start or _INTERESTING.search(line)]
    truncated = len(keep) < len(lines) or len(keep) > MAX_LINES
    keep = keep[-MAX_LINES:]
    return [redact(lines[i][:MAX_LINE_LENGTH]) for i in keep], truncated
