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

Write for a busy DevOps engineer who must fix this in minutes:
- root_cause: one short line, at most 15 words, pointing at the exact resource and setting.
  No "because", no story.
  Good: "ConfigMap queue-worker-config: queue.concurrency is 0 (allowed 1-64)".
  Bad: "The worker crashes because its config sets concurrency to an invalid value at startup."
- explanation: 2-3 short sentences on what breaks and why.
- fix_steps: short imperative steps, one action each, using real resource names.
- commands: exact, runnable kubectl commands with real names and namespaces. Start with the
  commands that apply the fix (patch, set, create, rollout restart), then one that verifies it.
  The user copies them as-is, so they must be complete:
  - Fill in every value you can find in the evidence or with the tools (image names with
    tags, ports, label values, sizes). Use full image references such as nginx:1.27-alpine.
  - Use <placeholders> only for values you cannot know, such as a password, and name them
    after what they hold: <database-url>, not <value>.
  - Verify against the workload (kubectl rollout status deployment/x, kubectl get pods -l
    app=x), never a pod name: the fix replaces the pods, so an old pod name shows the old state.
  - A Job cannot be edited or restarted. After fixing the cause, say how to re-create it.

When you are done, reply with only a JSON object, no prose and no code fences:
{
  "root_cause": "short line naming the resource and setting",
  "explanation": "2-3 short sentences",
  "fix_steps": ["one action per step"],
  "commands": ["kubectl command that applies the fix", "kubectl command that verifies it"],
  "prevention": "one short sentence",
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
