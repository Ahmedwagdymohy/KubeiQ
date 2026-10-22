"""Application settings loaded from environment variables (prefix ``KUBEIQ_``)."""

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KUBEIQ_", env_file=".env", extra="ignore")

    env: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    log_json: bool = False
    cors_origins: list[str] = ["http://localhost:3000"]

    # SQLite by default (zero setup). Postgres: postgresql+asyncpg://user:pass@host/kubeiq
    database_url: str = "sqlite+aiosqlite:///./kubeiq.db"
    max_concurrent_investigations: int = 4

    kubeconfig: str | None = None
    # Set to host.docker.internal when running in Docker against kind/minikube/k3d clusters.
    kubeconfig_localhost_alias: str | None = None

    # LLM via LiteLLM. Model uses LiteLLM naming, e.g. "litellm_proxy/<alias>", "openai/gpt-4.1",
    # "anthropic/<model>", "bedrock/<model>", "azure/<deployment>", "ollama/llama3.1".
    llm_model: str | None = None
    llm_api_base: str | None = None  # LiteLLM proxy URL, Azure endpoint, Ollama host, ...
    llm_api_key: SecretStr | None = (
        None  # optional; provider env vars (OPENAI_API_KEY, ...) also work
    )
    llm_timeout: float = 60.0
    llm_max_retries: int = 2
    llm_temperature: float = 0.0
    agent_max_steps: int = 6
    agent_max_incidents: int = 3  # cap AI investigations per run to bound cost


@lru_cache
def get_settings() -> Settings:
    return Settings()
