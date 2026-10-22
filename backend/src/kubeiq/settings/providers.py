"""AI providers the Settings page offers, and how they map to LiteLLM model names."""

from pydantic import BaseModel


class Provider(BaseModel):
    id: str
    label: str
    prefix: str  # LiteLLM provider prefix
    needs_key: bool = True
    needs_base: bool = False
    base_placeholder: str | None = None
    needs_api_version: bool = False
    model_placeholder: str
    help: str | None = None


PROVIDERS: list[Provider] = [
    Provider(id="openai", label="OpenAI", prefix="openai", model_placeholder="gpt-4.1"),
    Provider(
        id="anthropic", label="Anthropic", prefix="anthropic", model_placeholder="claude-sonnet-5-5"
    ),
    Provider(
        id="openrouter",
        label="OpenRouter",
        prefix="openrouter",
        model_placeholder="anthropic/claude-sonnet-5-5",
    ),
    Provider(
        id="azure",
        label="Azure OpenAI",
        prefix="azure",
        needs_base=True,
        base_placeholder="https://<resource>.openai.azure.com",
        needs_api_version=True,
        model_placeholder="<deployment-name>",
    ),
    Provider(
        id="bedrock",
        label="AWS Bedrock",
        prefix="bedrock",
        needs_key=False,
        model_placeholder="anthropic.claude-sonnet-5-5-v1:0",
        help="Uses the AWS credentials and region of the KubeiQ server environment",
    ),
    Provider(
        id="gemini", label="Google Gemini", prefix="gemini", model_placeholder="gemini-2.5-pro"
    ),
    Provider(
        id="ollama",
        label="Ollama (local)",
        prefix="ollama",
        needs_key=False,
        needs_base=True,
        base_placeholder="http://localhost:11434",
        model_placeholder="llama3.1",
    ),
    Provider(
        id="custom",
        label="LiteLLM proxy or OpenAI-compatible",
        prefix="openai",
        needs_base=True,
        base_placeholder="https://litellm.example.com",
        model_placeholder="<model-alias>",
        help="Any OpenAI-compatible endpoint: LiteLLM proxy, vLLM, LM Studio",
    ),
]

BY_ID = {p.id: p for p in PROVIDERS}


def litellm_model(provider_id: str, model: str) -> str:
    """``("openai", "gpt-4.1")`` -> ``"openai/gpt-4.1"``; already-prefixed names are kept."""
    provider = BY_ID[provider_id]
    model = model.strip()
    return model if model.startswith(f"{provider.prefix}/") else f"{provider.prefix}/{model}"
