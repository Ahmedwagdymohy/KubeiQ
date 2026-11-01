"""Combine what the scanners found into one list: one finding per problem per object, ranked by
risk, plus a posture score.

Two reports are the same problem when they are on the same object and touch the same field
(``securityContext.runAsNonRoot``), whichever scanner or check made them. Kubescape names the
fields it wants changed; for Trivy's checks the field comes from the table below.
"""

import re
from collections import defaultdict
from collections.abc import Iterable

from kubeiq.products.security.models import (
    SEVERITIES,
    WEIGHT,
    Finding,
    FixPath,
    ScanResult,
    Target,
    Vulnerability,
)

# Trivy check -> the fields it is about (same names as field_key gives Kubescape's fix paths).
TRIVY_FIELDS: dict[str, tuple[str, ...]] = {
    "KSV-0001": ("securityContext.allowPrivilegeEscalation",),
    "KSV-0003": ("securityContext.capabilities",),
    "KSV-0004": ("securityContext.capabilities",),
    "KSV-0106": ("securityContext.capabilities",),
    "KSV-0008": ("hostIPC",),
    "KSV-0009": ("hostNetwork",),
    "KSV-0010": ("hostPID",),
    "KSV-0011": ("resources.limits.cpu",),
    "KSV-0012": ("securityContext.runAsNonRoot",),
    "KSV-0020": ("securityContext.runAsUser", "securityContext.runAsNonRoot"),
    "KSV-0021": ("securityContext.runAsGroup", "securityContext.runAsNonRoot"),
    "KSV-0014": ("securityContext.readOnlyRootFilesystem",),
    "KSV-0015": ("resources.requests.cpu",),
    "KSV-0016": ("resources.requests.memory",),
    "KSV-0017": ("securityContext.privileged",),
    "KSV-0018": ("resources.limits.memory",),
    "KSV-0023": ("volumes.hostPath",),
    "KSV-0030": ("securityContext.seccompProfile",),
    "KSV-0104": ("securityContext.seccompProfile",),
    "KSV-0036": ("automountServiceAccountToken",),
}
# Checks that are the same rule in both scanners but name no single field.
SAME_CHECK = {("trivy", "KSV-0118"): ("kubescape", "C-0211")}
UMBRELLA = 3  # a finding about more fields than this never joins others
BUILT_IN_ROLES = {"admin", "edit", "view", "cluster-admin"}
SYSTEM_NAMESPACES = {"kube-system", "kube-public", "kube-node-lease", "local-path-storage"}
_PRIVILEGE_FIELDS = {
    "securityContext.privileged",
    "securityContext.runAsNonRoot",
    "securityContext.allowPrivilegeEscalation",
    "hostPID",
    "hostIPC",
    "hostNetwork",
    "volumes.hostPath",
}
_CIS_PREFIX = re.compile(r"^CIS-[\d.]+\s+")


def field_key(path: str) -> str:
    """spec.template.spec.containers[0].securityContext.seccompProfile.type
    -> securityContext.seccompProfile"""
    path = re.sub(r"\[\d*\]", "", path)
    path = path.rsplit("spec.", 1)[-1] if "spec." in path else path
    for anchor in ("securityContext.", "resources."):
        if anchor in path:
            rest = path.split(anchor, 1)[1].split(".")
            depth = 2 if anchor == "resources." else 1
            return anchor + ".".join(rest[:depth])
    parts = path.split(".")
    parts = [p for p in parts if p not in ("containers", "initContainers", "template")]
    return ".".join(parts[:2])


def _fields(finding: Finding) -> set[str]:
    keys = {field_key(f.path) for f in finding.fixes}
    for check in finding.checks:
        if check.tool == "trivy":
            keys.update(TRIVY_FIELDS.get(check.id, ()))
    return keys


def clean_title(title: str) -> str:
    return _CIS_PREFIX.sub("", title).replace("\\_", "_").rstrip(".")


def _join(group: list[Finding]) -> Finding:
    group.sort(key=lambda f: (SEVERITIES.index(f.severity), f.checks[0].tool != "trivy"))
    lead = group[0]
    checks, seen = [], set()
    fixes: list[FixPath] = []
    for f in group:
        for c in f.checks:
            if (c.tool, c.id) not in seen:
                seen.add((c.tool, c.id))
                checks.append(c)
        for fix in f.fixes:
            if all(fix.path != x.path for x in fixes):
                fixes.append(fix)
    description = lead.description or next((f.description for f in group if f.description), "")
    remediation = lead.remediation or next((f.remediation for f in group if f.remediation), "")
    return lead.model_copy(
        update={
            "key": f"{lead.target.ref}:{'+'.join(sorted(f'{c.tool}:{c.id}' for c in checks))}",
            "title": clean_title(lead.title),
            "checks": checks,
            "fixes": fixes,
            "description": description,
            "remediation": remediation,
        }
    )


def _root(parent: list[int], i: int) -> int:
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def merge_findings(findings: Iterable[Finding]) -> list[Finding]:
    by_target: dict[str, list[Finding]] = defaultdict(list)
    for f in findings:
        by_target[f.target.ref].append(f)
    merged: list[Finding] = []
    for group in by_target.values():
        # The same check on the same object (once per container) is one finding.
        same: dict[tuple[str, str], list[Finding]] = defaultdict(list)
        for f in group:
            check = (f.checks[0].tool, f.checks[0].id)
            same[SAME_CHECK.get(check, check)].append(f)
        singles = [_join(g) for g in same.values()]
        # Then join findings that touch a common field (union-find over shared fields).
        parent = list(range(len(singles)))

        owner: dict[str, int] = {}
        for i, f in enumerate(singles):
            keys = _fields(f)
            if len(keys) > UMBRELLA:
                continue  # a broad check ("apply a security context") stays on its own
            for key in keys:
                if key in owner:
                    parent[_root(parent, i)] = _root(parent, owner[key])
                else:
                    owner[key] = i
        clusters: dict[int, list[Finding]] = defaultdict(list)
        for i, f in enumerate(singles):
            clusters[_root(parent, i)].append(f)
        merged.extend(_join(c) if len(c) > 1 else c[0] for c in clusters.values())
    return merged


def rank(
    findings: list[Finding], vulnerabilities: list[Vulnerability], exposed: set[str]
) -> list[Finding]:
    """Order by risk: severity first, raised when the object is reachable from outside the
    cluster, runs with extra privilege or ships critical CVEs that have a fix; lowered for
    Kubernetes' own system namespaces."""
    privileged: set[str] = set()
    for f in findings:
        if _fields(f) & _PRIVILEGE_FIELDS:
            privileged.add(f.target.ref)
    fixable: dict[str, int] = defaultdict(int)
    for v in vulnerabilities:
        if v.severity == "critical" and v.fixed:
            for w in v.workloads:
                fixable[w.ref] += 1
    for f in findings:
        ref = f.target.ref
        risk = WEIGHT[f.severity] * 10
        reasons: list[str] = []
        if ref in exposed:
            risk += 30
            reasons.append("Reachable from outside the cluster")
        if ref in privileged:
            risk += 15
            reasons.append("Runs as root or with extra privileges")
        if fixable.get(ref):
            risk += 15
            reasons.append(f"Its images have {fixable[ref]} critical CVEs with a fix")
        if system_owned(f.target):
            risk //= 2
            reasons.append("Part of Kubernetes or the cluster's own add-ons")
        f.risk, f.reasons = risk, reasons
    return sorted(findings, key=lambda f: (-f.risk, f.target.ref, f.title))


def system_owned(target: Target) -> bool:
    if target.namespace in SYSTEM_NAMESPACES:
        return True
    return target.kind in ("ClusterRole", "ClusterRoleBinding") and (
        target.name in BUILT_IN_ROLES or target.name.startswith(("system:", "kubeadm:"))
    )


def combine(results: list[ScanResult], exposed: set[str]) -> ScanResult:
    """Without Kubescape, the first result with weights sets the fallback score."""
    weighted = next((r for r in results if r.passed_weight + r.failed_weight), ScanResult())
    findings = merge_findings(f for r in results for f in r.findings)
    vulnerabilities = [v for r in results for v in r.vulnerabilities]
    vulnerabilities.sort(
        key=lambda v: (SEVERITIES.index(v.severity), v.fixed is None, v.image, v.id)
    )
    return ScanResult(
        findings=rank(findings, vulnerabilities, exposed),
        vulnerabilities=vulnerabilities,
        controls=[c for r in results for c in r.controls],
        frameworks=[f for r in results for f in r.frameworks],
        images=sum(r.images for r in results),
        images_failed=[i for r in results for i in r.images_failed],
        compliance=next((r.compliance for r in results if r.compliance is not None), None),
        checked=weighted.checked,
        passed_weight=weighted.passed_weight,
        failed_weight=weighted.failed_weight,
    )


def score(result: ScanResult) -> int:
    """Kubescape's compliance score when it ran (the same number its frameworks are judged by);
    otherwise the severity-weighted share of Trivy's checks the cluster passes. 0-100."""
    if result.compliance is not None:
        return round(result.compliance)
    total = result.passed_weight + result.failed_weight
    return round(100 * result.passed_weight / total) if total else 100


def workload_ref(kind: str, name: str, namespace: str | None) -> str:
    return Target(kind=kind, name=name, namespace=namespace).ref
