"""Detector registry. A detector is a pure function: EvidenceBundle -> list[Finding]."""

from collections.abc import Callable

from loguru import logger

from kubeiq.collectors.models import EvidenceBundle
from kubeiq.detectors.fallback import unexplained_pods
from kubeiq.detectors.models import Finding

Detector = Callable[[EvidenceBundle], list[Finding]]

_DETECTORS: dict[str, Detector] = {}


def detector(name: str) -> Callable[[Detector], Detector]:
    def register(fn: Detector) -> Detector:
        _DETECTORS[name] = fn
        return fn

    return register


def run_detectors(bundle: EvidenceBundle) -> list[Finding]:
    # Import modules for their registration side effect.
    from kubeiq.detectors import containers, network, nodes, probes, scheduling, workloads  # noqa: F401

    findings: list[Finding] = []
    for name, fn in _DETECTORS.items():
        try:
            findings.extend(fn(bundle))
        except Exception:
            # A buggy detector must never break an investigation.
            logger.exception("Detector {} failed", name)
    # Safety net: every unhealthy pod must end up in at least one finding.
    return findings + unexplained_pods(bundle, findings)
