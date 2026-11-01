"""AI on top of the scanners: a plain summary of the cluster's security, and a fix for one
finding written against the live object. Detectors first, then the model (ADR 0005): the
scanners decide what is wrong; the model explains, prioritizes and drafts the change.

The model never changes the cluster. A fix is a patch and a complete ``kubectl patch`` command
the user reviews; applying it goes through Cluster Manager, where ADR 0009 applies.
"""

import asyncio
import json
import re
from typing import Any

import yaml
from kubernetes.client import (
    ApiClient,
    AppsV1Api,
    BatchV1Api,
    CoreV1Api,
    RbacAuthorizationV1Api,
)
from pydantic import BaseModel, Field, ValidationError

from kubeiq.agent.llm import LLMClient
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.products.security.models import Finding, Target, Vulnerability
from kubeiq.security.redaction import redact

MAX_OBJECT_CHARS = 12_000


class Priority(BaseModel):
    title: str
    why: str
    target: str | None = None


class PostureSummary(BaseModel):
    headline: str = Field(description="One sentence: the cluster's security in plain words")
    summary: str
    priorities: list[Priority] = Field(default_factory=list)
    quick_wins: list[str] = Field(default_factory=list)


class FindingFix(BaseModel):
    summary: str
    patch: dict[str, Any] | None = None  # strategic merge patch for the object
    command: str | None = None  # built by KubeiQ from the patch, complete
    steps: list[str] = Field(default_factory=list)  # when no patch can do it (RBAC, images)
    caution: str | None = None  # what the change could break


SUMMARY_PROMPT = """\
You are a Kubernetes security engineer. Below are the results of a security scan of one cluster
by Trivy and Kubescape: the score, counts, framework scores, the highest-risk findings (already
ranked: severity, raised for exposure and privileges) and the worst image vulnerabilities.

Reply with ONE JSON object and nothing else:
{
  "headline": "one sentence on the cluster's security, plain words",
  "summary": "two to four sentences: the main risks and what they mean for this cluster",
  "priorities": [{"title": "what to fix", "why": "why first, in this cluster",
                  "target": "namespace/Kind/name or null"}],
  "quick_wins": ["changes that are cheap and remove many findings at once"]
}

Rules:
- At most 5 priorities, most important first. Prefer exposed and privileged workloads and
  critical CVEs with a fix over theoretical issues; mention Kubernetes' own system objects only
  when they really matter.
- Ground every statement in the data given; never invent objects or numbers.
"""

FIX_PROMPT = """\
You are a Kubernetes security engineer. Write the change that fixes one finding on one object.
You get the finding (from Trivy or Kubescape, with the fields the scanner wants changed) and the
object as it is now (redacted).

Reply with ONE JSON object and nothing else:
{
  "summary": "one or two sentences: what the change does",
  "patch": <a strategic merge patch for this object as a JSON object, or null>,
  "steps": ["only when a patch cannot fix it (RBAC design, image rebuild): short steps"],
  "caution": "what the change could break and how to check, or null"
}

Rules:
- The patch must apply to this exact object: same kind, the real container names (containers
  are merged by name), only the fields needed. Never include status or metadata other than
  what must change.
- Pick safe values: runAsNonRoot true with a non-root runAsUser only when the image supports
  it (say so in caution), seccompProfile RuntimeDefault, drop ALL capabilities,
  allowPrivilegeEscalation false. For resource limits use the current requests or small
  sensible values and say how to tune them.
- Secrets appear as [REDACTED]; never ask for them.
"""


def _json(text: str | None) -> dict[str, Any]:
    if not text:
        raise ValueError("empty reply")
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    data = json.loads(cleaned[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("reply is not an object")
    return data


async def _ask(llm: LLMClient, system: str, content: str) -> dict[str, Any]:
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": redact(content)},
    ]
    reply = await llm.complete(messages)
    try:
        return _json(reply.content)
    except (ValueError, json.JSONDecodeError):
        messages += [
            reply.as_message(),
            {"role": "user", "content": "Reply again with only the JSON object described above."},
        ]
        return _json((await llm.complete(messages)).content)


def summary_input(
    score: int | None,
    summary: dict[str, Any],
    findings: list[Finding],
    vulnerabilities: list[Vulnerability],
) -> str:
    facts = {
        "score": score,
        "findings_by_severity": summary.get("findings"),
        "vulnerabilities_by_severity": summary.get("vulnerabilities"),
        "fixable_vulnerabilities": summary.get("fixable"),
        "frameworks": [
            {"name": f["name"], "score": f["score"]} for f in summary.get("frameworks") or []
        ],
        "top_findings": [
            {
                "title": f.title,
                "severity": f.severity,
                "object": f.target.ref,
                "risk": f.risk,
                "why_ranked": f.reasons,
                "checks": [f"{c.tool}:{c.id}" for c in f.checks],
            }
            for f in findings[:20]
        ],
        "worst_vulnerabilities": [
            {
                "id": v.id,
                "severity": v.severity,
                "image": v.image,
                "package": v.package,
                "fixed_in": v.fixed,
                "workloads": [w.ref for w in v.workloads][:5],
            }
            for v in vulnerabilities[:15]
        ],
    }
    return json.dumps(facts, indent=1)


async def summarize(llm: LLMClient, content: str) -> PostureSummary:
    data = await _ask(llm, SUMMARY_PROMPT, content)
    try:
        result = PostureSummary.model_validate(data)
    except ValidationError as exc:
        raise ValueError("The AI reply was not usable") from exc
    result.priorities = result.priorities[:5]
    return result


_READERS: dict[str, tuple[type, str, bool]] = {
    "Deployment": (AppsV1Api, "read_namespaced_deployment", True),
    "StatefulSet": (AppsV1Api, "read_namespaced_stateful_set", True),
    "DaemonSet": (AppsV1Api, "read_namespaced_daemon_set", True),
    "Job": (BatchV1Api, "read_namespaced_job", True),
    "CronJob": (BatchV1Api, "read_namespaced_cron_job", True),
    "Pod": (CoreV1Api, "read_namespaced_pod", True),
    "ServiceAccount": (CoreV1Api, "read_namespaced_service_account", True),
    "Service": (CoreV1Api, "read_namespaced_service", True),
    "Role": (RbacAuthorizationV1Api, "read_namespaced_role", True),
    "RoleBinding": (RbacAuthorizationV1Api, "read_namespaced_role_binding", True),
    "ClusterRole": (RbacAuthorizationV1Api, "read_cluster_role", False),
    "ClusterRoleBinding": (RbacAuthorizationV1Api, "read_cluster_role_binding", False),
}


def read_object(api: ApiClient, target: Target) -> dict[str, Any] | None:
    """The object as a plain dict without status and managed fields, or None for kinds the
    fixer does not read (Secrets are never read)."""
    reader = _READERS.get(target.kind)
    if reader is None:
        return None
    cls, method, namespaced = reader
    call = getattr(cls(api), method)
    args = (target.name, target.namespace) if namespaced else (target.name,)
    obj = api.sanitize_for_serialization(call(*args, _request_timeout=REQUEST_TIMEOUT))
    if not isinstance(obj, dict):
        return None
    obj.pop("status", None)
    meta = obj.get("metadata") or {}
    for key in ("managedFields", "resourceVersion", "uid", "generation", "creationTimestamp"):
        meta.pop(key, None)
    (meta.get("annotations") or {}).pop("kubectl.kubernetes.io/last-applied-configuration", None)
    return obj


def patch_command(target: Target, patch: dict[str, Any]) -> str:
    where = f" -n {target.namespace}" if target.namespace else ""
    body = json.dumps(patch, separators=(",", ":")).replace("'", "'\\''")
    return f"kubectl patch {target.kind.lower()} {target.name}{where} --type=strategic -p '{body}'"


def _containers(obj: dict[str, Any]) -> set[str]:
    spec = obj.get("spec") or {}
    for path in (("template", "spec"), ("jobTemplate", "spec", "template", "spec"), ()):
        node: Any = spec
        for key in path:
            node = (node or {}).get(key)
        if isinstance(node, dict) and node.get("containers"):
            return {
                str(c.get("name")) for c in node["containers"] + (node.get("initContainers") or [])
            }
    return set()


def _patched_containers(patch: Any) -> set[str]:
    names: set[str] = set()
    if isinstance(patch, dict):
        for key, value in patch.items():
            if key in ("containers", "initContainers") and isinstance(value, list):
                names.update(str(c.get("name")) for c in value if isinstance(c, dict))
            else:
                names |= _patched_containers(value)
    return names


async def fix(llm: LLMClient, api: ApiClient, finding: Finding) -> FindingFix:
    obj = await asyncio.to_thread(read_object, api, finding.target)
    text = yaml.safe_dump(obj, sort_keys=False)[:MAX_OBJECT_CHARS] if obj else "(not available)"
    facts = {
        "finding": finding.title,
        "severity": finding.severity,
        "object": finding.target.ref,
        "checks": [f"{c.tool}:{c.id} {c.name}" for c in finding.checks],
        "description": finding.description[:1500],
        "scanner_remediation": finding.remediation[:1500],
        "fields_to_change": [f"{f.path} = {f.value or '<choose>'}" for f in finding.fixes][:20],
    }
    data = await _ask(llm, FIX_PROMPT, json.dumps(facts, indent=1) + "\n\nObject:\n" + text)
    patch = data.get("patch") if isinstance(data.get("patch"), dict) else None
    if patch and obj is not None:
        unknown = _patched_containers(patch) - _containers(obj)
        if unknown:
            # A patch for containers that do not exist would add new, broken containers.
            names = ", ".join(sorted(unknown))
            raise ValueError(f"The AI patch names containers this object does not have: {names}")
    try:
        result = FindingFix(
            summary=str(data.get("summary") or ""),
            patch=patch,
            steps=[str(s) for s in data.get("steps") or []][:8],
            caution=data.get("caution") or None,
        )
    except ValidationError as exc:
        raise ValueError("The AI reply was not usable") from exc
    if patch and obj is not None:
        result.command = patch_command(finding.target, patch)
    return result
