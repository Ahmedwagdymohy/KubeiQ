"""Read a Trivy cluster scan (``trivy k8s --format json --report all``).

Trivy reports per object: configuration checks (``Class: config``) and, for workloads, one
result per package set in each image (``os-pkgs``, ``lang-pkgs``) with its vulnerabilities.
Owned objects (ReplicaSets, Pods of a Deployment) are excluded at scan time, so a problem is
reported on the workload a person edits.
"""

import re
from typing import Any

from kubeiq.products.security.models import (
    WEIGHT,
    Category,
    Check,
    Finding,
    ScanResult,
    Target,
    Vulnerability,
    severity_of,
)

_ACCESS_KINDS = {"ServiceAccount", "Role", "ClusterRole", "RoleBinding", "ClusterRoleBinding"}
_NETWORK_IDS = {"KSV-0009", "KSV-0024", "KSV-0056", "KSV-0108"}
_IMAGE_TARGET = re.compile(r"^(?P<image>\S+)(\s+\(.*\))?$")


def normalize_id(raw: str) -> str:
    """KSV001 and KSV-0001 are the same check (Trivy renamed its IDs)."""
    match = re.match(r"^([A-Z]+)-?0*(\d+)$", raw or "")
    return f"{match.group(1)}-{int(match.group(2)):04d}" if match else raw


def _category(check_id: str, target: Target) -> Category:
    if target.kind in _ACCESS_KINDS:
        return "access"
    if check_id in _NETWORK_IDS:
        return "network"
    if (
        target.kind in ("ControlPlaneComponents", "NodeComponents", "Node")
        or target.namespace is None
    ):
        return "cluster"
    return "workload"


def _image_of(result: dict[str, Any], metadata: dict[str, Any] | None) -> str | None:
    tags = (metadata or {}).get("RepoTags") or []
    if tags:
        return str(tags[0])
    match = _IMAGE_TARGET.match(result.get("Target") or "")
    return match.group("image") if match else None


def parse(report: dict[str, Any]) -> ScanResult:
    result = ScanResult()
    vulns: dict[tuple[str, str, str], Vulnerability] = {}
    images: set[str] = set()
    for resource in report.get("Resources") or []:
        if not resource.get("Kind") or not resource.get("Name"):
            continue
        target = Target(
            kind=resource["Kind"],
            name=resource["Name"],
            namespace=resource.get("Namespace") or None,
        )
        metadata = resource.get("Metadata") or []
        image_index = -1
        image: str | None = None
        for item in resource.get("Results") or []:
            kind = item.get("Class")
            if kind == "config":
                _config(result, target, item)
                continue
            if kind == "os-pkgs" or image is None:
                image_index += 1
                meta = metadata[image_index] if 0 <= image_index < len(metadata) else None
                image = _image_of(item, meta) if kind == "os-pkgs" or meta else image
            if image is None:
                continue
            images.add(image)
            for v in item.get("Vulnerabilities") or []:
                key = (image, v.get("VulnerabilityID", ""), v.get("PkgName", ""))
                found = vulns.get(key)
                if found is None:
                    found = vulns[key] = Vulnerability(
                        image=image,
                        id=v.get("VulnerabilityID", ""),
                        package=v.get("PkgName", ""),
                        installed=v.get("InstalledVersion", ""),
                        fixed=v.get("FixedVersion") or None,
                        severity=severity_of(v.get("Severity")),
                        title=(v.get("Title") or "")[:300],
                        url=v.get("PrimaryURL"),
                    )
                if target not in found.workloads:
                    found.workloads.append(target)
    result.vulnerabilities = list(vulns.values())
    result.images = len(images)
    return result


def _config(result: ScanResult, target: Target, item: dict[str, Any]) -> None:
    summary = item.get("MisconfSummary") or {}
    # Trivy counts passed checks without their severity; they count as medium for the score.
    passed = int(summary.get("Successes") or 0)
    result.checked += passed
    result.passed_weight += passed * WEIGHT["medium"]
    for m in item.get("Misconfigurations") or []:
        if m.get("Status", "FAIL") != "FAIL":
            continue
        check_id = normalize_id(m.get("ID") or m.get("AVDID") or "")
        severity = severity_of(m.get("Severity"))
        result.checked += 1
        result.failed_weight += WEIGHT[severity]
        message = m.get("Message") or ""
        result.findings.append(
            Finding(
                key=f"trivy:{check_id}:{target.ref}:{message}",
                title=m.get("Title") or check_id,
                severity=severity,
                category=_category(check_id, target),
                target=target,
                checks=[Check(tool="trivy", id=check_id, name=m.get("Title") or check_id)],
                description=" ".join(x for x in (m.get("Description"), message) if x),
                remediation=m.get("Resolution") or "",
            )
        )
