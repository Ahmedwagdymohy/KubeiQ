"""Pods that cannot be scheduled onto any node."""

import re

from kubeiq.collectors.models import EvidenceBundle
from kubeiq.detectors.helpers import events_for, workload_of
from kubeiq.detectors.models import Certainty, Finding, Severity
from kubeiq.detectors.registry import detector

_REASONS: list[tuple[str, str, str]] = [
    (
        r"Insufficient (cpu|memory|nvidia\.com/gpu|ephemeral-storage|pods)",
        "No node has enough free {0} for this pod",
        "Lower the {0} request, add nodes, or free capacity on existing nodes",
    ),
    (
        r"didn't match Pod's node affinity/selector|node\(s\) didn't match node selector",
        "No node matches the pod's nodeSelector or affinity",
        "Fix the nodeSelector/affinity or label a node to match",
    ),
    (
        r"untolerated taint",
        "Nodes have taints the pod does not tolerate",
        "Add a matching toleration or remove the taint from a node",
    ),
    (
        r"unbound immediate PersistentVolumeClaims|persistentvolumeclaim .* not found",
        "PersistentVolumeClaim is not bound",
        "Check the PVC status, its StorageClass and the storage provisioner",
    ),
    (
        r"Too many pods",
        "Nodes are at their maximum pod count",
        "Add nodes or raise max pods per node",
    ),
]


@detector("pending")
def detect_pending(bundle: EvidenceBundle) -> list[Finding]:
    findings = []
    for pod in bundle.unhealthy_pods:
        if pod.phase != "Pending":
            continue
        scheduled = next((c for c in pod.conditions if c.type == "PodScheduled"), None)
        if not scheduled or scheduled.status != "False":
            continue
        events = [e for e in events_for(bundle, pod.ref) if e.reason == "FailedScheduling"]
        message = " ".join(filter(None, [scheduled.message, *(e.message for e in events)]))
        finding = Finding(
            detector="pending",
            type="FailedScheduling",
            severity=Severity.CRITICAL,
            resource=pod.ref,
            workload=workload_of(pod),
            summary=f"Pod {pod.name} cannot be scheduled on any node",
            evidence=[e.ref for e in events],
            commands=[
                f"kubectl describe pod {pod.name} -n {pod.namespace}",
                "kubectl describe nodes | grep -A5 'Allocated resources'",
            ],
            details={"scheduler_message": message[:500]},
        )
        for pattern, cause, fix in _REASONS:
            found = re.search(pattern, message, re.IGNORECASE)
            if found:
                value = found.group(1) if found.groups() else ""
                finding.cause, finding.fix = cause.format(value), fix.format(value)
                finding.certainty = Certainty.HIGH
                if value in {"cpu", "memory"}:
                    requests = {c.name: c.requests.get(value) for c in pod.containers if c.requests}
                    finding.details["requests"] = requests
                    asked = [f"{v}" for v in requests.values() if v]
                    if asked:
                        finding.cause = (
                            f"Pod requests {' + '.join(asked)} {value}; no node has that free"
                        )
                    workload = finding.workload or pod.ref
                    kind, _, rest = workload.partition("/")
                    container = next((c for c, v in requests.items() if v), None)
                    if kind in {"Deployment", "StatefulSet", "DaemonSet"} and container:
                        finding.commands.insert(
                            0,
                            f"kubectl set resources {kind.lower()}/{rest.split('/')[-1]} "
                            f"-c {container} --requests={value}=<lower> -n {pod.namespace}",
                        )
                break
        findings.append(finding)
    return findings
