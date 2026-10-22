"""Application settings loaded from environment variables (prefix ``KUBEIQ_``)."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KUBEIQ_", env_file=".env", extra="ignore")

    env: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    log_json: bool = False
    cors_origins: list[str] = ["http://localhost:3000"]

    kubeconfig: str | None = None
    # Set to host.docker.internal when running in Docker against kind/minikube/k3d clusters.
    kubeconfig_localhost_alias: str | None = None
    llm_model: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
