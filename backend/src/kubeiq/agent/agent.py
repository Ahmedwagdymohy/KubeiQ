"""Tool-calling investigation loop for a single incident."""

import json
import re
from typing import Any

from loguru import logger
from pydantic import ValidationError

from kubeiq.agent.diagnosis import AgentAnswer, ToolStep
from kubeiq.agent.llm import LLMClient
from kubeiq.agent.prompts import (
    FINAL_ANSWER_PROMPT,
    FIX_JSON_PROMPT,
    SYSTEM_PROMPT,
    build_incident_context,
)
from kubeiq.agent.tools import TOOL_SPECS, AgentTools
from kubeiq.collectors.models import EvidenceBundle, ProgressEvent
from kubeiq.collectors.runner import ProgressCallback
from kubeiq.detectors.models import Incident


class AgentFailedError(RuntimeError):
    pass


def parse_answer(text: str | None) -> AgentAnswer:
    """Extract the JSON object from a model reply, tolerating code fences and stray prose."""
    if not text:
        raise ValueError("empty reply")
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    data = json.loads(cleaned[start : end + 1])
    data["confidence"] = max(0, min(100, int(data.get("confidence", 50))))
    answer = AgentAnswer.model_validate(data)
    answer.root_cause = concise(answer.root_cause)
    return answer


def concise(text: str, limit: int = 160) -> str:
    """Safety net for wordy models: keep the first sentence of a root cause."""
    text = " ".join(text.split())
    first = re.split(r"(?<=[a-z0-9)\]`'\"])\.\s+(?=[A-Z])", text, maxsplit=1)[0].rstrip(".")
    return first if len(first) <= limit else first[: limit - 1].rstrip() + "…"


async def investigate(
    incident: Incident,
    bundle: EvidenceBundle,
    llm: LLMClient,
    tools: AgentTools,
    max_steps: int,
    on_progress: ProgressCallback | None = None,
) -> tuple[AgentAnswer, list[ToolStep]]:
    async def emit(detail: str) -> None:
        if on_progress:
            await on_progress(ProgressEvent(step="agent", status="started", detail=detail))

    name = incident.workload.split("/")[-1]
    known_tools = {spec["function"]["name"] for spec in TOOL_SPECS}
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_incident_context(incident, bundle)},
    ]
    steps: list[ToolStep] = []

    for _ in range(max_steps):
        reply = await llm.complete(messages, TOOL_SPECS)
        if not reply.tool_calls:
            return await _finalize(llm, messages, reply.content), steps
        messages.append(reply.as_message())
        for call in reply.tool_calls:
            if (
                call.name in known_tools
            ):  # unknown tools still get an error reply, but no progress line
                await emit(f"{name}: {describe_call(call.name, call.arguments)}")
            result = await tools.run(call.name, call.arguments)
            steps.append(
                ToolStep(
                    tool=call.name, arguments=call.arguments, ok=not result.startswith("error")
                )
            )
            messages.append({"role": "tool", "tool_call_id": call.id, "content": result})

    messages.append({"role": "user", "content": FINAL_ANSWER_PROMPT})
    reply = await llm.complete(messages)
    return await _finalize(llm, messages, reply.content), steps


async def _finalize(
    llm: LLMClient, messages: list[dict[str, Any]], content: str | None
) -> AgentAnswer:
    try:
        return parse_answer(content)
    except (ValueError, ValidationError) as exc:
        logger.debug("Agent reply not valid JSON ({}), asking once more", exc)
    messages.append({"role": "assistant", "content": content or ""})
    messages.append({"role": "user", "content": FIX_JSON_PROMPT})
    reply = await llm.complete(messages)
    try:
        return parse_answer(reply.content)
    except (ValueError, ValidationError) as exc:
        raise AgentFailedError("The AI did not return a valid diagnosis") from exc


def describe_call(tool: str, args: dict[str, Any]) -> str:
    """Plain-language progress line for a tool call, e.g. 'Reading logs of pod web-1'."""
    previous = " (previous run)" if args.get("previous") else ""
    phrases = {
        "get_pod_logs": f"Reading logs of pod {args.get('pod', '')}{previous}",
        "describe_pod": f"Inspecting pod {args.get('pod', '')}",
        "get_events": f"Checking events for {args['name']}"
        if args.get("name")
        else "Checking events",
        "describe_workload": f"Inspecting {args.get('kind', 'workload')} {args.get('name', '')}",
        "list_pods": f"Listing pods {args['label_selector']}"
        if args.get("label_selector")
        else "Listing pods",
        "describe_service": f"Checking Service {args.get('name', '')}",
        "get_configmap": f"Reading ConfigMap {args.get('name', '')}",
        "describe_node": f"Inspecting node {args.get('name', '')}",
    }
    return phrases.get(tool, tool).strip()
