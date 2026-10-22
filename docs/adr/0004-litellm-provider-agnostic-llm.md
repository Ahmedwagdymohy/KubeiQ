# 0004 — LiteLLM for provider-agnostic LLM access

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
The prototype supported only OpenRouter. Enterprises often require Azure OpenAI, Bedrock, or fully local models.

## Decision
Use **LiteLLM as a library** for all model calls, configured with three settings:

| Setting | Purpose |
|---------|---------|
| `KUBEIQ_LLM_MODEL` | LiteLLM model name: `litellm_proxy/<alias>`, `openai/...`, `anthropic/...`, `openrouter/...`, `azure/...`, `bedrock/...`, `gemini/...`, `ollama/...` |
| `KUBEIQ_LLM_API_BASE` | Optional endpoint (LiteLLM proxy, Azure, Ollama, self-hosted gateways) |
| `KUBEIQ_LLM_API_KEY` | Optional key; standard provider env vars also work |

Leaving `KUBEIQ_LLM_MODEL` empty runs rule-based diagnosis only. Known-compromised LiteLLM releases
(1.82.7, 1.82.8) are excluded in `pyproject.toml`.

## Consequences
- One code path for every provider, including local Ollama for air-gapped installs.
- Tool calling / structured output must be validated per model family in tests.
