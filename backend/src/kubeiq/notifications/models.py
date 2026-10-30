"""Notification settings. Secret fields of channels are encrypted and never returned."""

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

ChannelType = Literal["slack", "teams", "discord", "telegram", "webhook", "email"]
RuleId = Literal[
    "cluster.unreachable",
    "cluster.no_access",
    "workload.failing",
    "node.not_ready",
    "investigation.critical",
    "event.reason",
    "plan.limit",
]
RULES: list[tuple[str, str]] = [
    ("cluster.unreachable", "A cluster becomes unreachable, and when it is back"),
    ("cluster.no_access", "KubeiQ loses read access to a cluster"),
    ("workload.failing", "A workload keeps failing (CrashLoopBackOff, ImagePullBackOff, Pending)"),
    ("node.not_ready", "A node is NotReady"),
    ("investigation.critical", "Cluster Doctor finds a critical issue"),
    ("event.reason", "A warning event with one of the chosen reasons"),
    ("plan.limit", "The plan's user, project or cluster limit is reached"),
]
# Fields that hold credentials, per channel type: stored encrypted, shown as "configured".
SECRET_FIELDS: dict[str, set[str]] = {
    "slack": {"url"},
    "teams": {"url"},
    "discord": {"url"},
    "telegram": {"token"},
    "webhook": {"url", "secret"},
    "email": {"password"},
}
REQUIRED: dict[str, set[str]] = {
    "slack": {"url"},
    "teams": {"url"},
    "discord": {"url"},
    "telegram": {"token", "chat_id"},
    "webhook": {"url"},
    "email": {"host", "sender", "to"},
}


class ChannelIn(BaseModel):
    id: str | None = None  # None: a new channel
    name: str = Field(min_length=1, max_length=60)
    type: ChannelType
    enabled: bool = True
    # url, token, chat_id, secret, host, port, username, password, sender, to, starttls.
    # A secret field left out (or null) keeps the saved value.
    config: dict[str, Any] = Field(default_factory=dict)


class ChannelOut(BaseModel):
    id: str
    name: str
    type: ChannelType
    enabled: bool
    config: dict[str, Any]  # without secrets
    secrets: list[str]  # which secret fields are configured
    last_error: str | None = None  # why the last message did not go out


DEFAULT_RULES: list[RuleId] = [
    "cluster.unreachable",
    "cluster.no_access",
    "workload.failing",
    "node.not_ready",
    "investigation.critical",
]


class Rules(BaseModel):
    enabled: list[RuleId] = Field(default_factory=lambda: list(DEFAULT_RULES))
    failing_minutes: int = Field(default=5, ge=1, le=1440)
    event_reasons: list[str] = Field(
        default_factory=lambda: ["OOMKilling", "FailedMount", "Evicted"]
    )
    cooldown_minutes: int = Field(default=60, ge=5, le=10080)
    quiet_start: int | None = Field(default=None, ge=0, le=23)  # hour, UTC
    quiet_end: int | None = Field(default=None, ge=0, le=23)


class NotificationsOut(BaseModel):
    channels: list[ChannelOut]
    rules: Rules
    available: list[dict[str, str]]


class ClusterAlerts(BaseModel):
    """Per cluster: None means every channel / every enabled rule."""

    channels: list[str] | None = None
    events: list[RuleId] | None = None


class Alert(BaseModel):
    key: str  # what it is about, e.g. "workload.failing:c1:shop/Deployment/web"
    rule: RuleId
    cluster_id: str | None
    cluster: str | None
    title: str
    text: str
    link: str | None = None
    resolved: bool = False


def new_id() -> str:
    return uuid.uuid4().hex[:12]
