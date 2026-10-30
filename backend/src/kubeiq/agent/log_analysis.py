"""Analyze a pod's logs with the model (docs/requirements/07): bounded, redacted lines and the
pod's own context in; a schema-validated analysis out, its errors pointing at line numbers."""

import asyncio
import json
import re
from datetime import UTC, datetime
from typing import Any, Literal

from kubernetes.client import ApiClient, CoreV1Api
from pydantic import BaseModel, Field, ValidationError

from kubeiq.agent.llm import LLMClient
from kubeiq.collectors import events, pods
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.security.redaction import redact

READ_LINES = 1000
KEEP_TAIL = 300
MAX_LINES = 400
MAX_LINE_LENGTH = 500
CONTEXT = 2
GAP = "…"
_INTERESTING = re.compile(
    r"(?i)\b(error|exception|fatal|panic|traceback|failed|refused|denied|timeout|"
    r"not found|missing|invalid|cannot|unable|killed|oom|warn(ing)?)\b"
)


class LogError(BaseModel):
    line: int = Field(description="Number of the line in the excerpt")
    meaning: str
    severity: Literal["critical", "warning", "info"] = "warning"


class LogAnalysis(BaseModel):
    summary: str
    status: Literal["healthy", "degraded", "failing"]
    errors: list[LogError] = Field(default_factory=list)
    root_cause: str | None = None
    fix_steps: list[str] = Field(default_factory=list)
    commands: list[str] = Field(default_factory=list)
    watch: list[str] = Field(default_factory=list)


class AnalyzedLogs(BaseModel):
    pod: str
    namespace: str
    container: str
    previous: bool
    lines: list[str]  # the excerpt the model saw, in order; GAP marks skipped lines
    analysis: LogAnalysis


def select(lines: list[str]) -> list[str]:
    """The tail plus every error-looking line further up (with two lines around it), in order,
    redacted and capped; skipped stretches become one GAP line."""
    tail_start = max(len(lines) - KEEP_TAIL, 0)
    keep: set[int] = set(range(tail_start, len(lines)))
    for i, line in enumerate(lines[:tail_start]):
        if _INTERESTING.search(line):
            keep.update(range(max(0, i - CONTEXT), min(tail_start, i + CONTEXT + 1)))
    chosen = sorted(keep)[-MAX_LINES:]
    out: list[str] = []
    last = -1
    for i in chosen:
        if last >= 0 and i != last + 1:
            out.append(GAP)
        out.append(redact(lines[i][:MAX_LINE_LENGTH]))
        last = i
    return out


LOG_ANALYSIS_PROMPT = """\
You are a senior Kubernetes SRE. Analyze the container logs below for this one pod, using its
status and recent events. The log lines are numbered as [n]; "…" marks lines that were skipped.

Reply with ONE JSON object and nothing else:
{
  "summary": "one or two sentences: what the logs show",
  "status": "healthy" | "degraded" | "failing",
  "errors": [{"line": <n>, "meaning": "what this line means, plainly",
              "severity": "critical" | "warning" | "info"}],
  "root_cause": "the most likely cause, one sentence, or null when nothing is wrong",
  "fix_steps": ["short steps"],
  "commands": ["complete kubectl commands with the real pod, container and namespace"],
  "watch": ["what to watch next to confirm the fix"]
}

Rules:
- Only lines that matter go in errors, at most 8, each with the [n] number shown.
- Ground everything in the lines, status and events given. If the logs look healthy, say so.
- Commands must run as-is: real names; <placeholders> only for values you cannot know.
- Secrets appear as [REDACTED]; never ask for them.
"""


def parse(text: str | None, line_count: int) -> LogAnalysis:
    if not text:
        raise ValueError("empty reply")
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    analysis = LogAnalysis.model_validate(json.loads(cleaned[start : end + 1]))
    analysis.errors = [e for e in analysis.errors if 0 <= e.line < line_count][:8]
    return analysis


def context(
    api: ApiClient, namespace: str, pod: str, container: str | None, previous: bool
) -> tuple[str, list[str], dict[str, Any]]:
    """(container, excerpt, facts about the pod) for the prompt."""
    core = CoreV1Api(api)
    obj: Any = core.read_namespaced_pod(pod, namespace, _request_timeout=REQUEST_TIMEOUT)
    names = [c.name for c in obj.spec.containers]
    every = names + [c.name for c in obj.spec.init_containers or []]
    chosen: str = container if container and container in every else str(names[0])
    raw = core.read_namespaced_pod_log(
        pod,
        namespace,
        container=chosen,
        previous=previous,
        tail_lines=READ_LINES,
        limit_bytes=512 * 1024,
        _request_timeout=REQUEST_TIMEOUT,
    )
    excerpt = select((raw or "").splitlines())
    snapshot = pods.to_snapshot(obj, datetime.now(UTC)).model_dump(
        mode="json", exclude_defaults=True
    )
    found = core.list_namespaced_event(
        namespace, field_selector=f"involvedObject.name={pod}", _request_timeout=REQUEST_TIMEOUT
    ).items
    recent = sorted(
        (events.to_record(e) for e in found),
        key=lambda r: r.last_seen or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )[:15]
    facts = {
        "pod": f"{namespace}/{pod}",
        "container": chosen,
        "previous_run": previous,
        "status": snapshot,
        "events": [r.model_dump(mode="json", exclude_defaults=True) for r in recent],
    }
    return chosen, excerpt, facts


async def analyze(
    api: ApiClient,
    namespace: str,
    pod: str,
    container: str | None,
    previous: bool,
    llm: LLMClient,
) -> AnalyzedLogs:
    chosen, excerpt, facts = await asyncio.to_thread(
        context, api, namespace, pod, container, previous
    )
    numbered = "\n".join(line if line == GAP else f"[{i}] {line}" for i, line in enumerate(excerpt))
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": LOG_ANALYSIS_PROMPT},
        {
            "role": "user",
            "content": json.dumps(facts, indent=1, default=str)
            + "\n\nLogs:\n"
            + (numbered or "(no log lines)"),
        },
    ]
    reply = await llm.complete(messages)
    try:
        analysis = parse(reply.content, len(excerpt))
    except (ValueError, ValidationError):
        messages += [
            reply.as_message(),
            {"role": "user", "content": "Reply again with only the JSON object described above."},
        ]
        analysis = parse((await llm.complete(messages)).content, len(excerpt))
    return AnalyzedLogs(
        pod=pod,
        namespace=namespace,
        container=chosen,
        previous=previous,
        lines=excerpt,
        analysis=analysis,
    )
