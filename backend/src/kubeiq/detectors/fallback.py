"""Catch-all for unhealthy pods that no specific detector explained.

Guarantees an unhealthy pod is never silently dropped: it becomes a finding with
certainty NONE, which routes it to the AI agent (or reports it as unexplained).
"""

from kubeiq.collectors.models import ContainerSnapshot, EvidenceBundle, PodSnapshot
from kubeiq.detectors.helpers import events_for, workload_of
from kubeiq.detectors.models import Finding, Severity


def unexplained_pods(bundle: EvidenceBundle, findings: list[Finding]) -> list[Finding]:
    explained = {f.resource for f in findings if not f.symptom}
    return [_finding(bundle, p) for p in bundle.unhealthy_pods if p.ref not in explained]


def _finding(bundle: EvidenceBundle, pod: PodSnapshot) -> Finding:
    problem = next((c for c in pod.containers if _is_broken(c)), None)
    warnings = events_for(bundle, pod.ref)
    if problem:
        kind = "init container" if problem.init else "container"
        state = problem.reason or problem.state
        summary = f"Pod {pod.name}: {kind} '{problem.name}' is {state}"
        if problem.exit_code not in (None, 0):
            summary += f" (exit code {problem.exit_code})"
        if problem.message:
            summary += f": {problem.message[:200]}"
        issue = problem.reason or pod.reason or pod.phase
    else:
        summary = f"Pod {pod.name} is {pod.reason or pod.phase}"
        if pod.message:
            summary += f": {pod.message[:200]}"
        elif warnings:
            summary += f": {warnings[0].reason}: {warnings[0].message[:200]}"
        issue = pod.reason or pod.phase

    return Finding(
        detector="unexplained",
        type=issue or "Unhealthy",
        severity=Severity.CRITICAL
        if problem or pod.phase in {"Failed", "Pending"}
        else Severity.WARNING,
        resource=pod.ref,
        workload=workload_of(pod),
        summary=summary,
        evidence=[e.ref for e in warnings],
        commands=[
            f"kubectl describe pod {pod.name} -n {pod.namespace}",
            f"kubectl get events -n {pod.namespace} "
            f"--field-selector involvedObject.name={pod.name}",
        ],
        details={
            "phase": pod.phase,
            "pod_reason": pod.reason,
            "containers": {
                c.name: {"state": c.state, "reason": c.reason, "exit_code": c.exit_code}
                for c in pod.containers
            },
        },
    )


def _is_broken(c: ContainerSnapshot) -> bool:
    if c.state == "waiting" and c.reason not in {None, "ContainerCreating", "PodInitializing"}:
        return True
    return c.state == "terminated" and (c.exit_code or 0) != 0
