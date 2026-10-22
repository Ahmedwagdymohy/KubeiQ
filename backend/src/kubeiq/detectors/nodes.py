"""Node health: NotReady nodes and resource pressure."""

from kubeiq.collectors.models import EvidenceBundle
from kubeiq.detectors.models import Certainty, Finding, Severity
from kubeiq.detectors.registry import detector


@detector("nodes")
def detect_node_problems(bundle: EvidenceBundle) -> list[Finding]:
    findings = []
    for node in bundle.nodes:
        if not node.ready:
            findings.append(
                Finding(
                    detector="nodes",
                    type="NodeNotReady",
                    severity=Severity.CRITICAL,
                    resource=node.ref,
                    workload=node.ref,
                    summary=f"Node {node.name} is NotReady",
                    cause="The kubelet on this node is not reporting healthy",
                    certainty=Certainty.MEDIUM,
                    fix="Check the node's kubelet, container runtime, network and disk",
                    commands=[f"kubectl describe node {node.name}"],
                )
            )
        for pressure in node.pressure:
            findings.append(
                Finding(
                    detector="nodes",
                    type=pressure,
                    severity=Severity.WARNING,
                    resource=node.ref,
                    workload=node.ref,
                    summary=f"Node {node.name} reports {pressure}",
                    cause=f"Node {node.name} is under {pressure}",
                    certainty=Certainty.HIGH,
                    fix="Free resources on the node or move workloads; pods may be evicted",
                    commands=[f"kubectl describe node {node.name}", "kubectl top nodes"],
                )
            )
    return findings
