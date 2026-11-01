"""Read a Kubescape framework scan (``kubescape scan framework ... --format json``).

Kubescape reports per control, per object, with the fields to change (``fixPath``). Control
texts (description, remediation) come from the framework files Kubescape caches next to the scan.
Failures Kubescape itself exempts (its built-in exceptions for kube-system) are left out.
"""

import json
from pathlib import Path
from typing import Any

from kubeiq.products.security.models import (
    WEIGHT,
    Category,
    Check,
    Control,
    Finding,
    FixPath,
    Framework,
    ScanResult,
    Target,
    severity_of,
)

FRAMEWORKS = ("nsa", "mitre", "cis-v1.12.0")
LABELS = {"NSA": "NSA-CISA", "MITRE": "MITRE ATT&CK", "cis-v1.12.0": "CIS Kubernetes 1.12"}
_ACCESS_KINDS = {
    "ServiceAccount",
    "Role",
    "ClusterRole",
    "RoleBinding",
    "ClusterRoleBinding",
    "User",
    "Group",
}
_NETWORK_CONTROLS = {"C-0030", "C-0260", "C-0054", "C-0041", "C-0044"}


def control_texts(cache_dir: Path) -> dict[str, dict[str, str]]:
    """Control ID -> description and remediation, from Kubescape's cached framework files."""
    texts: dict[str, dict[str, str]] = {}
    for path in cache_dir.glob("*.json"):
        try:
            data = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        for control in data.get("controls") or [] if isinstance(data, dict) else []:
            cid = control.get("controlID")
            if cid and cid not in texts:
                texts[cid] = {
                    "description": control.get("description") or "",
                    "remediation": control.get("remediation") or "",
                }
    return texts


def _category(control_id: str, target: Target) -> Category:
    if target.kind in _ACCESS_KINDS:
        return "access"
    if control_id in _NETWORK_CONTROLS:
        return "network"
    if target.namespace is None and target.kind not in ("Namespace",):
        return "cluster"
    return "workload"


def _fixes(rules: list[dict[str, Any]]) -> list[FixPath]:
    fixes: list[FixPath] = []
    for rule in rules:
        for path in rule.get("paths") or []:
            fix = path.get("fixPath") or {}
            if fix.get("path"):
                value = str(fix.get("value", ""))
                fixes.append(
                    FixPath(path=fix["path"], value="" if value == "YOUR_VALUE" else value)
                )
    return fixes


def _exempt(control: dict[str, Any]) -> bool:
    status = control.get("status") or {}
    if status.get("subStatus") == "w/exceptions":
        return True
    return any(rule.get("exception") for rule in control.get("rules") or [])


def parse(report: dict[str, Any], texts: dict[str, dict[str, str]]) -> ScanResult:
    summary = report.get("summaryDetails") or {}
    controls_meta: dict[str, Any] = summary.get("controls") or {}

    # Which frameworks each control belongs to, and the per-framework view.
    frameworks: list[Framework] = []
    controls: list[Control] = []
    member_of: dict[str, list[str]] = {}
    for fw in summary.get("frameworks") or []:
        label = LABELS.get(fw.get("name", ""), fw.get("name", ""))
        counts = {"passed": 0, "failed": 0, "skipped": 0}
        for cid, c in (fw.get("controls") or {}).items():
            member_of.setdefault(cid, []).append(label)
            status = c.get("status") or "skipped"
            status = status if status in counts else "skipped"
            counts[status] += 1
            rc = c.get("ResourceCounters") or {}
            info = c.get("statusInfo") or {}
            controls.append(
                Control(
                    framework=label,
                    id=cid,
                    name=c.get("name") or cid,
                    severity=severity_of((controls_meta.get(cid) or {}).get("severity")),
                    status=status,
                    passed=int(rc.get("passedResources") or 0),
                    failed=int(rc.get("failedResources") or 0),
                    note=_skip_note(info.get("info")) if status == "skipped" else None,
                )
            )
        frameworks.append(
            Framework(
                name=label,
                score=round(float(fw.get("complianceScore") or 0), 1),
                passed=counts["passed"],
                failed=counts["failed"],
                skipped=counts["skipped"],
            )
        )

    objects: dict[str, Target] = {}
    for resource in report.get("resources") or []:
        obj = resource.get("object") or {}
        meta = obj.get("metadata") or {}
        kind, name = obj.get("kind"), obj.get("name") or meta.get("name")
        if kind and name:
            namespace = obj.get("namespace") or meta.get("namespace") or None
            objects[resource["resourceID"]] = Target(kind=kind, name=name, namespace=namespace)

    compliance = summary.get("complianceScore")
    result = ScanResult(
        controls=controls,
        frameworks=frameworks,
        compliance=round(float(compliance), 1) if compliance is not None else None,
    )
    for row in report.get("results") or []:
        target = objects.get(row.get("resourceID", ""))
        if target is None:
            continue
        for control in row.get("controls") or []:
            cid = control.get("controlID", "")
            meta = controls_meta.get(cid) or {}
            severity = severity_of(control.get("severity") or meta.get("severity"))
            status = (control.get("status") or {}).get("status")
            if status == "passed":
                result.checked += 1
                result.passed_weight += WEIGHT[severity]
                continue
            if status != "failed" or _exempt(control):
                continue
            result.checked += 1
            result.failed_weight += WEIGHT[severity]
            text = texts.get(cid, {})
            result.findings.append(
                Finding(
                    key=f"kubescape:{cid}:{target.ref}",
                    title=control.get("name") or meta.get("name") or cid,
                    severity=severity,
                    category=_category(cid, target),
                    target=target,
                    checks=[
                        Check(
                            tool="kubescape",
                            id=cid,
                            name=control.get("name") or cid,
                            frameworks=member_of.get(cid, []),
                        )
                    ],
                    description=text.get("description", ""),
                    remediation=text.get("remediation", ""),
                    fixes=_fixes(control.get("rules") or []),
                )
            )
    return result


def _skip_note(info: str | None) -> str | None:
    if not info:
        return None
    if "hostdata.kubescape.cloud" in info or "operator" in info.lower():
        return "Needs node access (an in-cluster scanner, planned)"
    if "cloud" in info.lower() or "ClusterDescribe" in info:
        return "Needs the cloud provider's API"
    return info[:200]
