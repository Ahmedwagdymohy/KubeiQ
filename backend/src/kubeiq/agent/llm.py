"""Provider-agnostic LLM access through LiteLLM (ADR 0004).

The agent depends on the small ``LLMClient`` protocol, so tests can use a scripted fake.
Messages and tools use the OpenAI chat format; LiteLLM translates for each provider.
"""

import json
from dataclasses import dataclass, field
from typing import Any, Protocol

from loguru import logger

from kubeiq.core.config import Settings
from kubeiq.security.redaction import redact


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMReply:
    content: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)

    def as_message(self) -> dict[str, Any]:
        message: dict[str, Any] = {"role": "assistant", "content": self.content or ""}
        if self.tool_calls:
            message["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {"name": call.name, "arguments": json.dumps(call.arguments)},
                }
                for call in self.tool_calls
            ]
        return message


class LLMError(RuntimeError):
    pass


class LLMClient(Protocol):
    model: str

    async def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
    ) -> LLMReply: ...


class LiteLLMClient:
    def __init__(self, settings: Settings) -> None:
        if not settings.llm_model:
            raise ValueError("KUBEIQ_LLM_MODEL is not set")
        self.model = resolve_model(settings.llm_model, settings.llm_api_base)
        self._settings = settings

    async def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
    ) -> LLMReply:
        import litellm  # heavy import; only load when an LLM is actually used

        litellm.suppress_debug_info = True
        s = self._settings
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "timeout": s.llm_timeout,
            "num_retries": s.llm_max_retries,
            "temperature": s.llm_temperature,
            "drop_params": True,  # ignore params a provider does not support
        }
        if tools:
            kwargs["tools"] = tools
        if s.llm_api_base:
            kwargs["api_base"] = s.llm_api_base
        if s.llm_api_key:
            kwargs["api_key"] = s.llm_api_key.get_secret_value()
        if s.llm_api_version:
            kwargs["api_version"] = s.llm_api_version

        try:
            response = await litellm.acompletion(**kwargs)
        except Exception as exc:
            logger.warning("LLM call to {} failed: {}", self.model, type(exc).__name__)
            raise LLMError(_describe(exc)) from exc

        message = response.choices[0].message
        calls = []
        for call in message.tool_calls or []:
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}
            calls.append(ToolCall(id=call.id, name=call.function.name, arguments=arguments))
        return LLMReply(content=message.content, tool_calls=calls)


def resolve_model(model: str, api_base: str | None) -> str:
    """Make provider-less model names work against a custom endpoint.

    LiteLLM needs a provider prefix (``openai/``, ``anthropic/``, ...). A bare alias such as
    ``my-claude`` with an API base set is almost always a LiteLLM proxy or another
    OpenAI-compatible gateway (vLLM, LM Studio, ...), so route it through the generic
    OpenAI-compatible client. (``litellm_proxy/`` needs optional extras we do not install.)
    """
    import litellm

    litellm.suppress_debug_info = True
    try:
        litellm.get_llm_provider(model)
        return model
    except Exception:
        if api_base:
            logger.info("Model '{}' has no provider prefix; using openai/{}", model, model)
            return f"openai/{model}"
        return model


_HINTS = {
    "AuthenticationError": "LLM authentication failed. Check KUBEIQ_LLM_API_KEY",
    "PermissionDeniedError": "The LLM key is not allowed to use this model",
    "NotFoundError": "LLM model not found. Check KUBEIQ_LLM_MODEL",
    "RateLimitError": "LLM rate limit reached. Try again shortly",
    "Timeout": "LLM request timed out",
    "APIConnectionError": "Cannot reach the LLM endpoint. Check KUBEIQ_LLM_API_BASE",
    "BadRequestError": "The LLM rejected the request",
}


def _describe(exc: Exception) -> str:
    name = type(exc).__name__
    hint = _HINTS.get(name, f"LLM call failed ({name})")
    # Provider messages are often the most useful part; keep them short and scrubbed.
    detail = redact(" ".join(str(exc).split()))[:240]
    return f"{hint}: {detail}" if detail else hint


def get_llm(settings: Settings) -> LLMClient | None:
    return LiteLLMClient(settings) if settings.llm_model else None
