"""Application settings loaded from environment variables (prefix ``KUBEIQ_``)."""

import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KUBEIQ_", env_file=".env", extra="ignore")

    env: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    log_json: bool = False
    # Only needed when the app and the API are on different origins (local development).
    # A JSON list or a comma-separated string: http://localhost:3000,http://localhost:3002
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    # SQLite by default (zero setup). Postgres: postgresql+asyncpg://user:pass@host/kubeiq
    database_url: str = "sqlite+aiosqlite:///./kubeiq.db"
    max_concurrent_investigations: int = 4

    # Where KubeiQ keeps local state such as the generated encryption key (/data in Docker).
    data_dir: str = "."
    # Encrypts API keys and uploaded kubeconfigs at rest. Generated into data_dir when unset.
    secret_key: SecretStr | None = None

    # Admin sign-in (like LiteLLM): username "admin" + master key. Generated when unset.
    master_key: SecretStr | None = None
    admin_username: str = "admin"
    session_days: int = 7
    # Where the browser app lives when it is not on the API's origin (local development:
    # http://localhost:3000). Sign-in with Google returns there. Empty: the API's own origin.
    app_url: str | None = None

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
    llm_api_version: str | None = None  # Azure OpenAI only
    llm_timeout: float = 60.0
    llm_max_retries: int = 2
    llm_temperature: float = 0.0
    agent_max_steps: int = 6
    agent_max_incidents: int = 3  # cap AI investigations per run to bound cost

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("["):
                return json.loads(value)
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
