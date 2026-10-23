"""Apply saved settings on top of the environment and keep cluster sources in sync."""

import time
from typing import Any

import yaml
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.agent.llm import LiteLLMClient, LLMError
from kubeiq.clusters.registry import get_uploaded_source
from kubeiq.core.config import Settings
from kubeiq.settings import repository
from kubeiq.settings.crypto import decrypt, encrypt
from kubeiq.settings.models import AISettingsIn, AISettingsOut, TestResult
from kubeiq.settings.providers import BY_ID, litellm_model


def _ai_defaults(base: Settings) -> dict[str, Any]:
    return {
        "enabled": True,
        "provider": "openai",
        "model": "",
        "api_base": None,
        "api_version": None,
        "api_key": None,
        "max_incidents": base.agent_max_incidents,
        "max_steps": base.agent_max_steps,
    }


async def load_ai(session: AsyncSession, base: Settings) -> dict[str, Any]:
    return _ai_defaults(base) | (await repository.get_value(session, repository.AI_KEY) or {})


def apply_ai(base: Settings, ai: dict[str, Any]) -> Settings:
    """Environment settings with saved AI settings on top."""
    update: dict[str, Any] = {
        "agent_max_incidents": ai["max_incidents"],
        "agent_max_steps": ai["max_steps"],
    }
    if not ai["enabled"]:
        update["llm_model"] = None
    elif ai["model"]:
        update |= {
            "llm_model": litellm_model(ai["provider"], ai["model"]),
            "llm_api_base": ai["api_base"] or None,
            "llm_api_version": ai["api_version"] or None,
            "llm_api_key": SecretStr(decrypt(ai["api_key"])) if ai["api_key"] else None,
        }
    return base.model_copy(update=update)


async def effective_settings(session: AsyncSession, base: Settings) -> Settings:
    return apply_ai(base, await load_ai(session, base))


def to_view(ai: dict[str, Any], base: Settings) -> AISettingsOut:
    active = apply_ai(base, ai)
    if not ai["enabled"]:
        source = "none"
    elif ai["model"]:
        source = "settings"
    else:
        source = "environment" if base.llm_model else "none"
    hint = decrypt(ai["api_key"])[-4:] if ai["api_key"] else None
    return AISettingsOut(
        enabled=ai["enabled"],
        provider=ai["provider"],
        model=ai["model"],
        api_base=ai["api_base"],
        api_version=ai["api_version"],
        api_key_set=bool(ai["api_key"]),
        api_key_hint=hint,
        max_incidents=ai["max_incidents"],
        max_steps=ai["max_steps"],
        active_source=source,
        active_model=active.llm_model,
    )


def merge_ai(current: dict[str, Any], incoming: AISettingsIn) -> dict[str, Any]:
    if incoming.provider not in BY_ID:
        raise ValueError(f"Unknown provider '{incoming.provider}'")
    merged = incoming.model_dump(exclude={"api_key"})
    merged["model"] = merged["model"].strip()
    if incoming.api_key is None:
        merged["api_key"] = current.get("api_key")
    else:
        merged["api_key"] = encrypt(incoming.api_key.strip()) if incoming.api_key.strip() else None
    return merged


async def test_ai(ai: dict[str, Any], base: Settings) -> TestResult:
    settings = apply_ai(base, ai)
    if not settings.llm_model:
        return TestResult(ok=False, message="Choose a provider and a model first")
    client = LiteLLMClient(settings.model_copy(update={"llm_max_retries": 0}))
    started = time.perf_counter()
    try:
        await client.complete([{"role": "user", "content": "Reply with the single word OK."}])
    except LLMError as exc:
        return TestResult(ok=False, model=client.model, message=str(exc))
    latency = int((time.perf_counter() - started) * 1000)
    return TestResult(ok=True, model=client.model, message="Connected", latency_ms=latency)


async def sync_uploaded_clusters(session: AsyncSession) -> None:
    """Load stored kubeconfigs into the cluster registry (startup and after changes)."""
    files = {
        row.name: yaml.safe_load(decrypt(row.content))
        for row in await repository.list_kubeconfigs(session)
    }
    get_uploaded_source().set_files(files)


async def changes_enabled(session: AsyncSession) -> bool:
    """Cluster changes (scale, restart, delete, ...) are off until an admin turns them on."""
    value = await repository.get_value(session, repository.CHANGES_KEY)
    return bool(value and value.get("enabled"))
