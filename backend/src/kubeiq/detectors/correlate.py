"""Group findings into incidents and pick the root cause of each.

One bad deploy can produce many findings: 5 crashing pods, a stuck rollout and a Service
with no endpoints. They share a workload, so they become one incident whose root is the
most specific, most certain cause; everything else is listed as related impact.
"""

from collections import defaultdict

from kubeiq.detectors.models import Certainty, Finding, Incident, Severity

_SEVERITY_RANK = {Severity.CRITICAL: 2, Severity.WARNING: 1, Severity.INFO: 0}


def _root_rank(f: Finding) -> tuple[int, int, int, int]:
    return (
        0 if f.symptom else 1,
        int(f.certainty),
        1 if f.cause else 0,
        _SEVERITY_RANK[f.severity],
    )


def correlate(findings: list[Finding]) -> list[Incident]:
    groups: dict[str, list[Finding]] = defaultdict(list)
    for finding in findings:
        groups[finding.workload or finding.resource].append(finding)

    incidents = []
    for workload, group in groups.items():
        ranked = sorted(group, key=_root_rank, reverse=True)
        root = _merge_same_cause(ranked)
        related = [f for f in ranked if f is not root and f.id != root.id]
        affected = sorted({f.resource for f in group})
        severity = max((f.severity for f in group), key=_SEVERITY_RANK.__getitem__)
        incidents.append(
            Incident(
                id=workload,
                title=_title(workload, root),
                workload=workload,
                severity=severity,
                root=root,
                related=related,
                affected=affected,
            )
        )
    return sorted(
        incidents,
        key=lambda i: (_SEVERITY_RANK[i.severity], len(i.affected), int(i.root.certainty)),
        reverse=True,
    )


def _merge_same_cause(ranked: list[Finding]) -> Finding:
    """Pick the root; if several pods share the same root cause, note how many."""
    root = ranked[0].model_copy(deep=True)
    same = [f for f in ranked if f.type == root.type and f.cause == root.cause]
    if len(same) > 1:
        root.details["occurrences"] = len(same)
        root.evidence = sorted({ref for f in same for ref in f.evidence})
    return root


def _title(workload: str, root: Finding) -> str:
    name = workload.split("/")[-1]
    return f"{name}: {root.type}" if root.certainty > Certainty.NONE else f"{name}: {root.summary}"
