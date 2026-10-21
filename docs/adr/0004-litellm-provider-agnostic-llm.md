# 0004 — LiteLLM for provider-agnostic LLM access

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
The prototype supported only OpenRouter. Enterprises often require Azure OpenAI, Bedrock, or fully local models.

## Decision
Use **LiteLLM as a library** for all model calls. Model and credentials are configured via env (`KUBEIQ_LLM_MODEL`, provider keys). OpenRouter remains supported (`openrouter/<model>`).

## Consequences
- One code path for every provider, including local Ollama for air-gapped installs.
- Tool calling / structured output must be validated per model family in tests.
