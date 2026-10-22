"""Building fix and verification commands.

Rules every suggested command follows:
- Fix commands are complete and runnable; values are filled in from the cluster whenever the
  evidence allows. Placeholders are reserved for values KubeiQ cannot know (passwords, URLs)
  and are named after what they stand for, e.g. ``<database-url>``.
- Verification targets the workload, never a specific pod: a fix replaces the pods, so a pod
  name from before the fix shows the old, broken state.
"""

import re
from collections import Counter

from kubeiq.collectors.models import EvidenceBundle, NodeSnapshot

_MUTATING = {
    "annotate",
    "apply",
    "cordon",
    "create",
    "delete",
    "drain",
    "edit",
    "expose",
    "label",
    "patch",
    "replace",
    "scale",
    "set",
    "taint",
    "uncordon",
}
_VERB = re.compile(
    r"kubectl\s+(?:(?:-n|--namespace|--context)[\s=]\S+\s+)*([a-z-]+)(?:\s+([a-z-]+))?"
)
_POD_SCOPED = re.compile(r"kubectl\s+(?:describe|logs|top)\s+(?:pod\s+)?[\w.-]+-[a-z0-9]{5}\b")


def target(workload: str) -> str:
    """``Deployment/shop/payment`` -> ``deployment/payment``."""
    kind, _, rest = workload.partition("/")
    return f"{kind.lower()}/{rest.split('/')[-1]}"


def placeholder(name: str) -> str:
    """``DATABASE_URL`` -> ``<database-url>``."""
    return f"<{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')}>"


def is_fix(command: str) -> bool:
    """True when the command changes the cluster (any part of a ``&&`` chain)."""
    for verb, sub in _VERB.findall(command):
        if verb in _MUTATING or (verb == "rollout" and sub in {"restart", "undo"}):
            return True
    return False


def is_pod_scoped(command: str) -> bool:
    """describe/logs/top of one generated pod name; stale once the fix rolls out new pods."""
    return bool(_POD_SCOPED.search(command))


def verify_commands(workload: str, bundle: EvidenceBundle) -> list[str]:
    """Commands that confirm a workload recovered after a fix."""
    kind, _, rest = workload.partition("/")
    namespace, _, name = rest.rpartition("/")
    ns = f"-n {namespace}"
    if kind in {"Deployment", "StatefulSet", "DaemonSet"}:
        commands = [f"kubectl rollout status {kind.lower()}/{name} {ns} --timeout=120s"]
        snapshot = next((w for w in bundle.workloads if w.ref == workload), None)
        if snapshot and snapshot.selector:
            selector = ",".join(f"{k}={v}" for k, v in sorted(snapshot.selector.items()))
            commands.append(f"kubectl get pods {ns} -l {selector}")
        return commands
    if kind == "Job":
        return [f"kubectl wait --for=condition=complete job/{name} {ns} --timeout=120s"]
    if kind == "Pod":
        return [f"kubectl get pod {name} {ns}"]
    return []


def arrange(commands: list[str], verify: list[str]) -> tuple[list[str], list[str]]:
    """Split commands into (fix, verify).

    With a fix: fix commands first; verification is the workload check plus any read-only
    command that is not tied to a stale pod name. Without a fix, the read-only commands are
    the next investigation steps and there is nothing to verify yet.
    """
    fixes = [c for c in commands if is_fix(c)]
    checks = [c for c in commands if not is_fix(c)]
    if not fixes:
        return checks, []
    extra = [c for c in checks if not is_pod_scoped(c)]
    unique: dict[str, str] = {}
    for command in [*verify, *extra]:
        unique.setdefault(_signature(command), command)
    return fixes, list(unique.values())


_NOISE = re.compile(r"\s(?:-n|--namespace)[\s=]\S+|\s--timeout=\S+")


def _signature(command: str) -> str:
    """Compare commands ignoring namespace placement and timeouts."""
    return " ".join(_NOISE.sub("", f" {command}").split())


def image_repository(image: str) -> str:
    """Image without tag or digest: ``registry:5000/team/app:1.2`` -> ``registry:5000/team/app``."""
    name = image.split("@", 1)[0]
    slash = name.rfind("/")
    colon = name.rfind(":")
    return name[:colon] if colon > slash else name


def running_image(bundle: EvidenceBundle, repository: str, exclude: str) -> str | None:
    """Most common image of the same repository that a running container already pulled."""
    seen = Counter(
        c.image
        for p in bundle.pods
        for c in p.containers
        if c.state == "running" and c.image != exclude and image_repository(c.image) == repository
    )
    return seen.most_common(1)[0][0] if seen else None


_MIB = 1024**2
_MEMORY_UNITS = {
    "Ki": 1 / 1024,
    "Mi": 1,
    "Gi": 1024,
    "K": 1e3 / _MIB,
    "M": 1e6 / _MIB,
    "G": 1e9 / _MIB,
}


def to_mebibytes(quantity: str | None) -> float | None:
    match = re.fullmatch(r"(\d+(?:\.\d+)?)(Ki|Mi|Gi|K|M|G)?", quantity or "")
    if not match:
        return None
    if match.group(2) is None:  # plain bytes
        return float(match.group(1)) / _MIB
    return float(match.group(1)) * _MEMORY_UNITS[match.group(2)]


def format_memory(mebibytes: float) -> str:
    mi = int(mebibytes)
    return f"{mi // 1024}Gi" if mi >= 1024 and mi % 1024 == 0 else f"{mi}Mi"


def raised_memory(limit: str | None) -> str | None:
    """Next memory limit to try: double, and at least 256Mi.

    The kernel does not report how far over the limit a process went, so this is a step,
    not a measurement. Small limits get a larger jump because they are usually far off.
    """
    current = to_mebibytes(limit)
    if current is None:
        return None
    return format_memory(max(current * 2, 256))


def to_millicores(quantity: str | None) -> int | None:
    match = re.fullmatch(r"(\d+(?:\.\d+)?)(m)?", quantity or "")
    if not match:
        return None
    value = float(match.group(1))
    return int(value if match.group(2) else value * 1000)


def format_cpu(millicores: int) -> str:
    return str(millicores // 1000) if millicores % 1000 == 0 else f"{millicores}m"


def fitting_request(resource: str, nodes: list[NodeSnapshot]) -> str | None:
    """A request that fits on the largest schedulable node, leaving room for other pods."""
    if resource == "cpu":
        sizes = [to_millicores(n.allocatable.get("cpu")) for n in nodes if not n.unschedulable]
        cpu = max((s for s in sizes if s), default=0)
        return format_cpu(max(100, cpu // 2 // 100 * 100)) if cpu else None
    if resource == "memory":
        sizes_mi = [to_mebibytes(n.allocatable.get("memory")) for n in nodes if not n.unschedulable]
        mem = max((s for s in sizes_mi if s), default=0.0)
        return format_memory(max(128, int(mem / 2) // 128 * 128)) if mem else None
    return None
