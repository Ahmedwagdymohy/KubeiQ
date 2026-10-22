"""Readiness and liveness probe failures."""

from kubeiq.collectors.models import ContainerSnapshot, EvidenceBundle, Probe
from kubeiq.detectors.helpers import app_containers, events_for, workload_of
from kubeiq.detectors.models import Certainty, Finding, Severity
from kubeiq.detectors.registry import detector


@detector("probes")
def detect_probe_failures(bundle: EvidenceBundle) -> list[Finding]:
    findings = []
    # Not limited to unhealthy pods: a pod can fail readiness for minutes before it is flagged.
    for pod in bundle.pods:
        events = [e for e in events_for(bundle, pod.ref) if e.reason == "Unhealthy"]
        for kind in ("Readiness", "Liveness"):
            failing = [e for e in events if e.message.startswith(f"{kind} probe failed")]
            if not failing:
                continue
            container = _probed_container(app_containers(pod), kind)
            probe = (
                (container.readiness_probe if kind == "Readiness" else container.liveness_probe)
                if container
                else None
            )
            finding = Finding(
                detector="probes",
                type=f"{kind}ProbeFailed",
                severity=Severity.WARNING if kind == "Readiness" else Severity.CRITICAL,
                resource=pod.ref,
                workload=workload_of(pod),
                summary=(
                    f"{kind} probe failing for pod {pod.name} "
                    f"({sum(e.count for e in failing)} times): {failing[0].message[:200]}"
                ),
                evidence=[e.ref for e in failing],
                commands=[f"kubectl describe pod {pod.name} -n {pod.namespace}"],
                details={"probe": probe.summary if probe else None},
            )
            if container and probe:
                _explain(finding, container, probe, failing[0].message, kind)
            findings.append(finding)
    return findings


def _probed_container(containers: list[ContainerSnapshot], kind: str) -> ContainerSnapshot | None:
    attr = "readiness_probe" if kind == "Readiness" else "liveness_probe"
    return next((c for c in containers if getattr(c, attr)), None)


def _explain(
    finding: Finding, container: ContainerSnapshot, probe: Probe, message: str, kind: str
) -> None:
    lower = message.lower()
    if isinstance(probe.port, int) and container.ports and probe.port not in container.ports:
        finding.cause = (
            f"{kind} probe checks port {probe.port}, but the container listens on "
            f"{', '.join(map(str, container.ports))}"
        )
        finding.fix = f"Point the {kind.lower()} probe at the port the app actually serves"
        finding.certainty = Certainty.HIGH
    elif "statuscode: 404" in lower or "404" in lower:
        finding.cause = f"{kind} probe path {probe.path} returns 404 (endpoint does not exist)"
        finding.fix = "Use a health endpoint the app actually exposes"
        finding.certainty = Certainty.HIGH
    elif "connection refused" in lower:
        finding.cause = f"Nothing is listening on the probed port {probe.port}"
        finding.fix = (
            "Check the app's listen port or increase initialDelaySeconds if it starts slowly"
        )
        finding.certainty = Certainty.MEDIUM
    elif "timeout" in lower or "deadline exceeded" in lower:
        finding.cause = f"{kind} probe times out ({probe.summary})"
        finding.fix = "Raise timeoutSeconds or investigate why the health endpoint is slow"
        finding.certainty = Certainty.MEDIUM
