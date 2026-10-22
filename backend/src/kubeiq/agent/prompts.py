"""Prompt construction for the troubleshooting agent.

The agent receives one incident at a time with only the evidence relevant to it.
"""

import json
from typing import Any

from kubeiq.collectors.models import EvidenceBundle
from kubeiq.detectors.models import Finding, Incident

SYSTEM_PROMPT = """\
You are a senior Kubernetes SRE investigating one incident in a production cluster.

How to work:
- Start from the findings and evidence provided. Use the tools to verify and to fill gaps,
  for example reading previous container logs, events, or related pods and services.
- Tools are read-only. Never suggest that you changed anything.
- Correlate signals (pod state, exit codes, logs, events, rollout status, endpoints) and
  separate the root cause from its symptoms.
- Be specific: name the exact resource, container, setting, value or log line.
- If the evidence is insufficient, say what is missing and lower your confidence.
- Secrets are redacted as [REDACTED]; that is expected and not a problem by itself.

When you are done, reply with only a JSON object, no prose and no code fences:
{
  "root_cause": "one sentence naming the specific cause",
  "explanation": "2-4 sentences connecting the evidence to the cause",
  "fix_steps": ["ordered, concrete steps"],
  "commands": ["kubectl commands that apply or verify the fix"],
  "prevention": "one sentence on how to avoid this in the future",
  "confidence": 0-100,
  "evidence": ["short references to what supports the conclusion"],
  "agrees_with_rules": true | false | null
}
Set agrees_with_rules to null if no rule-based cause was given.
"""

FINAL_ANSWER_PROMPT = (
    "Stop investigating. Reply now with only the JSON object described in the instructions."
)

FIX_JSON_PROMPT = (
    "Your last reply was not valid JSON for the required schema. "
    "Reply again with only the JSON object."
)


def _finding_view(f: Finding) -> dict[str, Any]:
    view: dict[str, Any] = {"type": f.type, "resource": f.resource, "summary": f.summary}
    if f.cause:
        view["rule_cause"] = f.cause
        view["rule_certainty"] = f.certainty.name
    if f.details:
        view["details"] = f.details
    return view


def build_incident_context(incident: Incident, bundle: EvidenceBundle) -> str:
    affected = set(incident.affected)
    pods = [p for p in bundle.pods if p.ref in affected][:3]
    pod_refs = {p.ref for p in pods}
    events = [e for e in bundle.events if e.involved in affected][:15]
    logs = [lg for lg in bundle.logs if lg.pod in pod_refs][:4]

    context = {
        "cluster": bundle.scope.cluster_id,
        "incident": incident.title,
        "workload": incident.workload,
        "root_finding": _finding_view(incident.root),
        "related_findings": [_finding_view(f) for f in incident.related][:8],
        "pods": [p.model_dump(mode="json", exclude_defaults=True) for p in pods],
        "events": [
            {"object": e.involved, "reason": e.reason, "message": e.message, "count": e.count}
            for e in events
        ],
        "logs": [
            {"container": lg.ref, "previous": lg.previous, "lines": lg.lines[-60:]} for lg in logs
        ],
        "evidence_gaps": [g.model_dump() for g in bundle.gaps],
    }
    return "Investigate this incident and find the root cause.\n\n" + json.dumps(
        context, indent=1, default=str
    )
