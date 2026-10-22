"""Workloads with fewer ready replicas than desired, or stuck rollouts."""

from kubeiq.collectors.models import EvidenceBundle
from kubeiq.detectors.models import Finding, Severity
from kubeiq.detectors.registry import detector


@detector("rollout")
def detect_unhealthy_workloads(bundle: EvidenceBundle) -> list[Finding]:
    findings = []
    for w in bundle.workloads:
        stuck = next(
            (
                c
                for c in w.conditions
                if c.type == "Progressing" and c.reason == "ProgressDeadlineExceeded"
            ),
            None,
        )
        if w.ready >= w.desired and not stuck:
            continue
        findings.append(
            Finding(
                detector="rollout",
                type="RolloutStuck" if stuck else "ReplicasUnavailable",
                severity=Severity.CRITICAL if w.ready == 0 and w.desired > 0 else Severity.WARNING,
                resource=w.ref,
                workload=w.ref,
                summary=(
                    f"{w.kind} {w.name} has {w.ready}/{w.desired} ready replicas"
                    + (" and its rollout exceeded the progress deadline" if stuck else "")
                ),
                symptom=True,
                commands=[f"kubectl rollout status {w.kind.lower()}/{w.name} -n {w.namespace}"],
                details={"desired": w.desired, "ready": w.ready, "updated": w.updated},
            )
        )
    return findings
