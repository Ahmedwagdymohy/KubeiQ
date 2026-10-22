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
    return AgentAnswer.model_validate(data)


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
            await emit(f"{incident.title}: {call.name}({_args(call.arguments)})")
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


def _args(arguments: dict[str, Any]) -> str:
    return ", ".join(f"{k}={v}" for k, v in arguments.items() if k != "namespace")
