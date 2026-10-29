"""Follow-up questions on a diagnosed incident ("Explain"): the diagnosis is the context and
the read-only tools let the model check the live cluster."""

from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from kubeiq.agent.agent import AgentFailedError, describe_call
from kubeiq.agent.diagnosis import Diagnosis
from kubeiq.agent.llm import LLMClient
from kubeiq.agent.prompts import CHAT_SYSTEM_PROMPT, build_chat_context
from kubeiq.agent.tools import TOOL_SPECS

MAX_HISTORY = 20  # earlier messages of the thread sent with each question
MAX_ANSWER_CHARS = 8000

StepCallback = Callable[[str], Awaitable[None]]

WRAP_UP_PROMPT = "Stop using tools. Answer the question now with what you have."


class Tools(Protocol):
    async def run(self, name: str, arguments: dict[str, Any]) -> str: ...


async def answer(
    diagnosis: Diagnosis,
    cluster_id: str,
    history: list[dict[str, str]],
    question: str,
    llm: LLMClient,
    tools: Tools | None,
    max_steps: int,
    on_step: StepCallback | None = None,
) -> str:
    """Answer one question. ``history`` holds earlier ``{"role", "content"}`` turns, oldest first.
    Without ``tools`` (cluster unreachable) the model answers from the diagnosis alone."""
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
        {"role": "user", "content": build_chat_context(diagnosis, cluster_id)},
        {"role": "assistant", "content": "Understood. What would you like to know?"},
        *history[-MAX_HISTORY:],
        {"role": "user", "content": question},
    ]
    specs = TOOL_SPECS if tools is not None else None
    known = {spec["function"]["name"] for spec in TOOL_SPECS}

    for _ in range(max_steps):
        reply = await llm.complete(messages, specs)
        if not reply.tool_calls or tools is None:
            return _clean(reply.content)
        messages.append(reply.as_message())
        for call in reply.tool_calls:
            if on_step and call.name in known:
                await on_step(describe_call(call.name, call.arguments))
            result = await tools.run(call.name, call.arguments)
            messages.append({"role": "tool", "tool_call_id": call.id, "content": result})

    messages.append({"role": "user", "content": WRAP_UP_PROMPT})
    return _clean((await llm.complete(messages)).content)


def _clean(content: str | None) -> str:
    text = (content or "").strip()
    if not text:
        raise AgentFailedError("The AI returned an empty answer")
    return text[:MAX_ANSWER_CHARS]
