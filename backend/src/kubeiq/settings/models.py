"""Settings API models. Secrets are write-only: responses only say whether one is saved."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from kubeiq.clusters.gke import GkeIdentity, GkeProject, GkeProjectStatus


class AISettingsIn(BaseModel):
    enabled: bool = True
    provider: str = "openai"
    model: str = ""
    api_base: str | None = None
    api_version: str | None = None
    # None keeps the saved key, "" removes it, any other value replaces it.
    api_key: str | None = None
    max_incidents: int = Field(default=3, ge=0, le=20)
    max_steps: int = Field(default=6, ge=1, le=20)


class AISettingsOut(BaseModel):
    enabled: bool
    provider: str
    model: str
    api_base: str | None
    api_version: str | None
    api_key_set: bool
    api_key_hint: str | None  # last 4 characters
    max_incidents: int
    max_steps: int
    # Where the model in use comes from, so users understand env vs saved settings.
    active_source: Literal["settings", "environment", "none"]
    active_model: str | None


class TestResult(BaseModel):
    ok: bool
    model: str | None = None
    message: str
    latency_ms: int | None = None


class KubeconfigIn(BaseModel):
    name: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")
    content: str = Field(min_length=10, max_length=256_000)
    project_id: str | None = None  # where its clusters go; the only project when not given


class KubeconfigOut(BaseModel):
    id: str
    name: str
    contexts: list[str]
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime


class GkeSettingsIn(BaseModel):
    projects: list[GkeProject] = Field(max_length=50)


class GkeSettingsOut(BaseModel):
    identity: GkeIdentity
    projects: list[GkeProjectStatus]


class GoogleSettingsIn(BaseModel):
    enabled: bool = False
    client_id: str = Field(default="", max_length=255)
    client_secret: str | None = None  # None keeps the saved secret, "" removes it


class GoogleSettingsOut(BaseModel):
    enabled: bool
    client_id: str
    client_secret_set: bool
    client_secret_hint: str | None  # last 4 characters
    redirect_uri: str  # add this in the Google Cloud console


class LocalKubeconfig(BaseModel):
    path: str
    contexts: int
    error: str | None = None


class ChangesSettings(BaseModel):
    enabled: bool


class AboutOut(BaseModel):
    version: str
    database: str
    secrets: str
    local_kubeconfig: LocalKubeconfig
