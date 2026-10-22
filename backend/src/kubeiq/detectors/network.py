"""Services that route to nothing: selector typos or no ready pods."""

from difflib import SequenceMatcher

from kubeiq.collectors.models import EvidenceBundle, PodSnapshot, ServiceSnapshot
from kubeiq.detectors.helpers import workload_of
from kubeiq.detectors.models import Certainty, Finding, Severity
from kubeiq.detectors.registry import detector

SIMILARITY = 0.75


def _matches(selector: dict[str, str], labels: dict[str, str]) -> bool:
    return all(labels.get(k) == v for k, v in selector.items())


@detector("service_endpoints")
def detect_service_without_endpoints(bundle: EvidenceBundle) -> list[Finding]:
    findings = []
    for svc in bundle.services:
        if not svc.selector or svc.ready_endpoints > 0:
            continue
        pods = [p for p in bundle.pods if p.namespace == svc.namespace]
        matching = [p for p in pods if _matches(svc.selector, p.labels)]
        if matching:
            findings.append(_no_ready_pods(svc, matching))
        else:
            findings.append(_selector_mismatch(svc, pods))
    return findings


def _no_ready_pods(svc: ServiceSnapshot, matching: list[PodSnapshot]) -> Finding:
    workload = workload_of(matching[0])
    return Finding(
        detector="service_endpoints",
        type="NoReadyEndpoints",
        severity=Severity.CRITICAL,
        resource=svc.ref,
        workload=workload,
        summary=(
            f"Service {svc.name} has no ready endpoints: "
            f"{len(matching)} matching pod(s), none ready"
        ),
        symptom=True,
        details={"selector": svc.selector, "pods": [p.ref for p in matching]},
    )


def _selector_mismatch(svc: ServiceSnapshot, pods: list[PodSnapshot]) -> Finding:
    selector = ", ".join(f"{k}={v}" for k, v in svc.selector.items())
    finding = Finding(
        detector="service_endpoints",
        type="SelectorMismatch",
        severity=Severity.CRITICAL,
        resource=svc.ref,
        workload=svc.ref,
        summary=f"Service {svc.name} selects no pods (selector {selector})",
        cause=f"Service selector {selector} matches no pods",
        certainty=Certainty.MEDIUM,
        fix="Update the Service selector to match the pod labels, or fix the pod labels",
        commands=[
            f"kubectl get pods -n {svc.namespace} --show-labels",
            f"kubectl edit service {svc.name} -n {svc.namespace}",
        ],
        verify=[
            f"kubectl get endpointslices -n {svc.namespace} "
            f"-l kubernetes.io/service-name={svc.name}"
        ],
        details={"selector": svc.selector},
    )
    near = _closest_labels(svc.selector, pods)
    if near:
        key, wanted, actual, pod = near
        finding.cause = f"Service selector {key}={wanted} matches no pods (pods use {key}={actual})"
        finding.fix = f"Change the Service selector to {key}={actual}"
        finding.certainty = Certainty.HIGH
        finding.workload = workload_of(pod)
        finding.commands = [
            f"kubectl patch service {svc.name} -n {svc.namespace} "
            f'-p \'{{"spec":{{"selector":{{"{key}":"{actual}"}}}}}}\''
        ]
        finding.details["suggested_selector"] = {key: actual}
    return finding


def _closest_labels(
    selector: dict[str, str], pods: list[PodSnapshot]
) -> tuple[str, str, str, PodSnapshot] | None:
    best: tuple[float, str, str, str, PodSnapshot] | None = None
    for pod in pods:
        for key, wanted in selector.items():
            actual = pod.labels.get(key)
            if actual is None or actual == wanted:
                continue
            others = {k: v for k, v in selector.items() if k != key}
            if not _matches(others, pod.labels):
                continue
            score = SequenceMatcher(None, wanted, actual).ratio()
            if score >= SIMILARITY and (best is None or score > best[0]):
                best = (score, key, wanted, actual, pod)
    return best[1:] if best else None
