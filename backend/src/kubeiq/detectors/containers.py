"""Container failures: CrashLoopBackOff, OOMKilled, image pull errors."""

import re

from kubeiq.collectors.models import ContainerSnapshot, EvidenceBundle, PodSnapshot
from kubeiq.detectors.helpers import app_containers, events_for, has_env, logs_for, workload_of
from kubeiq.detectors.models import Certainty, Finding, Severity
from kubeiq.detectors.patterns import match_logs
from kubeiq.detectors.registry import detector

_EXIT_CODES: dict[int, tuple[str, str, Certainty]] = {
    126: (
        "The container command is not executable",
        "Check the entrypoint file permissions in the image",
        Certainty.HIGH,
    ),
    127: (
        "The container command was not found in the image",
        "Fix the command/args or the image entrypoint",
        Certainty.HIGH,
    ),
    139: (
        "The process crashed with a segmentation fault",
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
        for c in app_containers(pod):
            crashing = c.reason == "CrashLoopBackOff" or (
                c.restart_count > 0 and c.state != "running" and c.last_reason != "OOMKilled"
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
            f"Container '{c.name}' keeps crashing ({c.restart_count} restarts, "
            f"last exit code {exit_code})"
        ),
        evidence=[e.ref for e in events_for(bundle, pod.ref) if e.reason == "BackOff"],
        details={"container": c.name, "exit_code": exit_code, "restarts": c.restart_count},
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
        for c in app_containers(pod):
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
                        f"Container exceeded its memory limit of {limit}"
                        if limit
                        else "Container ran out of memory on the node (no memory limit set)"
                    ),
                    certainty=Certainty.HIGH,
                    fix=(
                        "Raise the memory limit (and request) or reduce the app's memory usage"
                        if limit
                        else "Set memory requests/limits and check node memory pressure"
                    ),
                    commands=[
                        f"kubectl set resources {kind.lower()}/{rest.split('/')[-1]} -c {c.name} "
                        f"--limits=memory=<higher> {_kubectl_ns(pod)}",
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
            f"Image reference '{c.image}' is not a valid image name",
            "Fix the image field in the pod spec",
            Certainty.HIGH,
        )
    if re.search(r"(?i)not found|manifest unknown|does not exist|no such manifest", text):
        return (
            f"Image '{c.image}' does not exist in the registry (wrong name or tag)",
            "Use an existing image tag; check the registry for available tags",
            Certainty.HIGH,
        )
    if re.search(r"(?i)unauthorized|authentication required|denied|forbidden|401|403", text):
        return (
            f"The registry rejected the pull for '{c.image}' (missing or invalid credentials)",
            "Create an imagePullSecret with valid registry credentials and reference it in the pod",
            Certainty.HIGH,
        )
    if re.search(r"(?i)no such host|i/o timeout|connection refused|dial tcp|tls", text):
        return (
            "The node cannot reach the image registry",
            "Check node egress, proxy settings, DNS and the registry address",
            Certainty.MEDIUM,
        )
    return (
        f"Image '{c.image}' cannot be pulled",
        "Check the image name, tag and registry access",
        Certainty.LOW,
    )
