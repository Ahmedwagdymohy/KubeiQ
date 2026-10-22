"""Container failures: CrashLoopBackOff, OOMKilled, image pull and config errors."""

import re

from kubeiq.collectors.models import ContainerSnapshot, EvidenceBundle, PodSnapshot
from kubeiq.detectors.helpers import events_for, has_env, logs_for, workload_of
from kubeiq.detectors.models import Certainty, Finding, Severity
from kubeiq.detectors.patterns import match_logs
from kubeiq.detectors.registry import detector

_EXIT_CODES: dict[int, tuple[str, str, Certainty]] = {
    126: (
        "Container command is not executable",
        "Check the entrypoint file permissions in the image",
        Certainty.HIGH,
    ),
    127: (
        "Container command not found in the image",
        "Fix the command/args or the image entrypoint",
        Certainty.HIGH,
    ),
    139: (
        "Process crashed (segmentation fault)",
        "Check native dependencies and the image architecture",
        Certainty.MEDIUM,
    ),
}

_PULL_ERRORS = {"ErrImagePull", "ImagePullBackOff", "InvalidImageName", "ErrImageNeverPull"}


def _kubectl_ns(pod: PodSnapshot) -> str:
    return f"-n {pod.namespace}"


@detector("crashloop")
def detect_crashloop(bundle: EvidenceBundle) -> list[Finding]:
    findings = []
    for pod in bundle.unhealthy_pods:
        # Init containers included: a crashing init container blocks the whole pod.
        for c in pod.containers:
            completed = c.init and c.state == "terminated" and c.exit_code == 0
            crashing = c.reason == "CrashLoopBackOff" or (
                c.restart_count > 0 and c.state != "running" and not completed
            )
            if not crashing or c.last_reason == "OOMKilled":
                continue
            findings.append(_crashloop_finding(bundle, pod, c))
    return findings


def _crashloop_finding(bundle: EvidenceBundle, pod: PodSnapshot, c: ContainerSnapshot) -> Finding:
    exit_code = c.last_exit_code if c.last_exit_code is not None else c.exit_code
    finding = Finding(
        detector="crashloop",
        type="CrashLoopBackOff",
        severity=Severity.CRITICAL,
        resource=pod.ref,
        workload=workload_of(pod),
        summary=(
            f"{'Init container' if c.init else 'Container'} '{c.name}' keeps crashing "
            f"({c.restart_count} restarts, last exit code {exit_code})"
            + (", so the app containers cannot start" if c.init else "")
        ),
        evidence=[e.ref for e in events_for(bundle, pod.ref) if e.reason == "BackOff"],
        details={
            "container": c.name,
            "init": c.init,
            "exit_code": exit_code,
            "restarts": c.restart_count,
        },
        commands=[
            f"kubectl logs {pod.name} -c {c.name} --previous {_kubectl_ns(pod)}",
            f"kubectl describe pod {pod.name} {_kubectl_ns(pod)}",
        ],
    )

    for excerpt in logs_for(bundle, pod, c.name):
        matches = match_logs(excerpt.lines)
        if not matches:
            continue
        best = matches[0]
        finding.cause, finding.fix, finding.certainty = (
            best.cause,
            best.pattern.fix.format(best.value or ""),
            best.pattern.certainty,
        )
        finding.evidence.append(
            f"{excerpt.ref}{'@previous' if excerpt.previous else ''}#L{best.line_number + 1}"
        )
        finding.details["log_line"] = best.line
        if best.pattern.key == "missing_env" and best.value:
            _refine_missing_env(finding, pod, c, best.value)
        return finding

    if exit_code in _EXIT_CODES:
        finding.cause, finding.fix, finding.certainty = _EXIT_CODES[exit_code]
    return finding


def _refine_missing_env(
    finding: Finding, pod: PodSnapshot, c: ContainerSnapshot, name: str
) -> None:
    workload = finding.workload or pod.ref
    kind, _, rest = workload.partition("/")
    target = f"{kind.lower()}/{rest.split('/')[-1]}"
    if has_env(c, name):
        finding.cause = (
            f"{name} is defined in the pod spec but the app reports it as missing or empty"
        )
        finding.fix = f"Check that the Secret/ConfigMap key behind {name} exists and has a value"
        finding.certainty = Certainty.MEDIUM
    elif c.env_from:
        finding.fix = (
            f"{name} is not in the container env; check that {', '.join(c.env_from)} contains it"
        )
        finding.certainty = Certainty.MEDIUM
    else:
        finding.commands.insert(
            0,
            f"kubectl set env {target} {name}=<value> -c {c.name} {_kubectl_ns(pod)}",
        )


@detector("oom")
def detect_oom(bundle: EvidenceBundle) -> list[Finding]:
    findings = []
    for pod in bundle.unhealthy_pods:
        for c in pod.containers:
            if "OOMKilled" not in (c.reason, c.last_reason):
                continue
            limit = c.limits.get("memory")
            workload = workload_of(pod)
            kind, _, rest = workload.partition("/")
            findings.append(
                Finding(
                    detector="oom",
                    type="OOMKilled",
                    severity=Severity.CRITICAL,
                    resource=pod.ref,
                    workload=workload,
                    summary=f"Container '{c.name}' was killed for using too much memory",
                    cause=(
                        f"Memory limit {limit} is too low (container OOMKilled)"
                        if limit
                        else "Container ran out of memory (no memory limit set)"
                    ),
                    certainty=Certainty.HIGH,
                    fix=(
                        "Raise the memory limit (and request) or reduce the app's memory usage"
                        if limit
                        else "Set memory requests/limits and check node memory pressure"
                    ),
                    commands=[
                        f"kubectl set resources {kind.lower()}/{rest.split('/')[-1]} -c {c.name} "
                        f"--limits=memory={_double(limit)} {_kubectl_ns(pod)}",
                        f"kubectl top pod {pod.name} {_kubectl_ns(pod)}",
                    ],
                    details={
                        "container": c.name,
                        "memory_limit": limit,
                        "memory_request": c.requests.get("memory"),
                        "restarts": c.restart_count,
                    },
                )
            )
    return findings


@detector("image_pull")
def detect_image_pull(bundle: EvidenceBundle) -> list[Finding]:
    findings = []
    for pod in bundle.unhealthy_pods:
        for c in pod.containers:
            if c.reason not in _PULL_ERRORS:
                continue
            events = [
                e
                for e in events_for(bundle, pod.ref)
                if e.reason in {"Failed", "ErrImagePull", "InspectFailed"}
            ]
            text = " ".join([c.message or "", *(e.message for e in events)])
            cause, fix, certainty = _classify_pull_error(c, text)
            workload = workload_of(pod)
            kind, _, rest = workload.partition("/")
            findings.append(
                Finding(
                    detector="image_pull",
                    type="ImagePullBackOff",
                    severity=Severity.CRITICAL,
                    resource=pod.ref,
                    workload=workload,
                    summary=f"Container '{c.name}' cannot pull image {c.image}",
                    cause=cause,
                    certainty=certainty,
                    fix=fix,
                    evidence=[e.ref for e in events],
                    commands=[
                        f"kubectl set image {kind.lower()}/{rest.split('/')[-1]} "
                        f"{c.name}=<valid-image> {_kubectl_ns(pod)}",
                        f"kubectl describe pod {pod.name} {_kubectl_ns(pod)}",
                    ],
                    details={"container": c.name, "image": c.image, "message": text.strip()[:500]},
                )
            )
    return findings


def _classify_pull_error(c: ContainerSnapshot, text: str) -> tuple[str, str, Certainty]:
    if c.reason == "InvalidImageName":
        return (
            f"Invalid image name: {c.image}",
            "Fix the image field in the pod spec",
            Certainty.HIGH,
        )
    if re.search(r"(?i)not found|manifest unknown|does not exist|no such manifest", text):
        return (
            f"Image {c.image} not found in the registry (wrong tag or name)",
            "Use an existing image tag; check the registry for available tags",
            Certainty.HIGH,
        )
    if re.search(r"(?i)unauthorized|authentication required|denied|forbidden|401|403", text):
        return (
            f"Registry denied pulling {c.image} (missing or invalid pull secret)",
            "Create an imagePullSecret with valid registry credentials and reference it in the pod",
            Certainty.HIGH,
        )
    if re.search(r"(?i)no such host|i/o timeout|connection refused|dial tcp|tls", text):
        return (
            "Node cannot reach the image registry",
            "Check node egress, proxy settings, DNS and the registry address",
            Certainty.MEDIUM,
        )
    return (
        f"Image {c.image} cannot be pulled",
        "Check the image name, tag and registry access",
        Certainty.LOW,
    )


_CONFIG_ERRORS: list[tuple[str, str, str]] = [
    (
        r"couldn't find key (\S+) in (Secret|ConfigMap) ([\w.-]+)/([\w.-]+)",
        "{1} {3} is missing key '{0}'",
        "Add key '{0}' to {1} {3}, or fix the key name in the pod spec",
    ),
    (
        r"(secret|configmap) \"([\w.-]+)\" not found",
        "{0} {1} does not exist",
        "Create the {0} '{1}' in this namespace, or fix its name in the pod spec",
    ),
    (
        r"runAsNonRoot and image will run as root",
        "Image runs as root but runAsNonRoot is required",
        "Set runAsUser to a non-zero UID or use an image built to run as non-root",
    ),
]


_KINDS = {"secret": "Secret", "configmap": "ConfigMap"}


@detector("container_config")
def detect_config_errors(bundle: EvidenceBundle) -> list[Finding]:
    findings = []
    for pod in bundle.unhealthy_pods:
        for c in pod.containers:
            if c.reason != "CreateContainerConfigError":
                continue
            message = c.message or ""
            finding = Finding(
                detector="container_config",
                type="CreateContainerConfigError",
                severity=Severity.CRITICAL,
                resource=pod.ref,
                workload=workload_of(pod),
                summary=f"Container '{c.name}' cannot be created: {message[:200]}",
                commands=[f"kubectl describe pod {pod.name} {_kubectl_ns(pod)}"],
                details={"container": c.name, "message": message},
            )
            for pattern, cause, fix in _CONFIG_ERRORS:
                found = re.search(pattern, message, re.IGNORECASE)
                if not found:
                    continue
                groups = [_KINDS.get(g.lower(), g) for g in found.groups()]
                finding.cause, finding.fix = cause.format(*groups), fix.format(*groups)
                finding.certainty = Certainty.HIGH
                finding.commands[0:0] = _config_fix_commands(groups, pod)
                break
            findings.append(finding)
    return findings


def _config_fix_commands(groups: list[str], pod: PodSnapshot) -> list[str]:
    ns = _kubectl_ns(pod)
    if len(groups) == 4:  # missing key: [key, kind, namespace, name]
        key, kind, _, name = groups
        field = "stringData" if kind == "Secret" else "data"
        return [
            f"kubectl patch {kind.lower()} {name} {ns} --type merge "
            f'-p \'{{"{field}":{{"{key}":"<value>"}}}}\'',
            f"kubectl rollout restart deployment -l app={pod.labels.get('app', '<app>')} {ns}",
        ]
    if len(groups) == 2:  # missing object: [kind, name]
        kind, name = groups
        create = "secret generic" if kind == "Secret" else "configmap"
        return [f"kubectl create {create} {name} {ns} --from-literal=<key>=<value>"]
    return []


def _double(limit: str | None) -> str:
    """Suggest twice the current memory limit, e.g. 64Mi -> 128Mi."""
    match = re.fullmatch(r"(\d+)(Ki|Mi|Gi|M|G)?", limit or "")
    if not match:
        return "<higher>"
    return f"{int(match.group(1)) * 2}{match.group(2) or ''}"
