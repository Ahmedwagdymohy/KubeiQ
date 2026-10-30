"""Load and save notification settings, and deliver alerts to the right channels."""

import asyncio
from datetime import UTC, datetime
from typing import Any

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.db.models import DEFAULT_ORG, ClusterSetting
from kubeiq.notifications import channels
from kubeiq.notifications.models import (
    REQUIRED,
    RULES,
    SECRET_FIELDS,
    Alert,
    ChannelIn,
    ChannelOut,
    ClusterAlerts,
    NotificationsOut,
    Rules,
    new_id,
)
from kubeiq.settings import repository
from kubeiq.settings.crypto import decrypt, encrypt

KEY = "notifications"
last_errors: dict[str, str] = {}  # channel id -> the last delivery error, for Settings


async def load(session: AsyncSession) -> dict[str, Any]:
    value = await repository.get_value(session, KEY) or {}
    return {"channels": value.get("channels") or [], "rules": value.get("rules") or {}}


def view(doc: dict[str, Any]) -> NotificationsOut:
    out = []
    for c in doc["channels"]:
        secrets = SECRET_FIELDS.get(c["type"], set())
        out.append(
            ChannelOut(
                id=c["id"],
                name=c["name"],
                type=c["type"],
                enabled=c.get("enabled", True),
                config={k: v for k, v in c["config"].items() if k not in secrets},
                secrets=sorted(k for k in secrets if c["config"].get(k)),
                last_error=last_errors.get(c["id"]),
            )
        )
    return NotificationsOut(
        channels=out,
        rules=Rules(**doc["rules"]),
        available=[{"id": rid, "label": label} for rid, label in RULES],
    )


def merge_channel(existing: dict[str, Any] | None, body: ChannelIn) -> dict[str, Any]:
    """The stored form: secret fields encrypted; a missing secret keeps the saved one."""
    secrets = SECRET_FIELDS[body.type]
    old = (existing or {}).get("config") or {}
    config: dict[str, Any] = {}
    for key, value in body.config.items():
        if key in secrets:
            if value:
                config[key] = encrypt(str(value).strip())
        elif value is not None:
            config[key] = value.strip() if isinstance(value, str) else value
    for key in secrets:
        if key not in config and old.get(key) and (existing or {}).get("type") == body.type:
            config[key] = old[key]
    missing = [k for k in REQUIRED[body.type] if not config.get(k)]
    if missing:
        raise ValueError(f"Fill in {', '.join(missing)}")
    return {
        "id": body.id or new_id(),
        "name": body.name.strip(),
        "type": body.type,
        "enabled": body.enabled,
        "config": config,
    }


def decrypted(channel: dict[str, Any]) -> dict[str, Any]:
    secrets = SECRET_FIELDS.get(channel["type"], set())
    return {k: decrypt(v) if k in secrets and v else v for k, v in channel["config"].items()}


def quiet(rules: Rules, now: datetime) -> bool:
    if rules.quiet_start is None or rules.quiet_end is None or rules.quiet_start == rules.quiet_end:
        return False
    hour = now.astimezone(UTC).hour
    if rules.quiet_start < rules.quiet_end:
        return rules.quiet_start <= hour < rules.quiet_end
    return hour >= rules.quiet_start or hour < rules.quiet_end  # over midnight


def routing(row: ClusterSetting | None) -> ClusterAlerts:
    return ClusterAlerts(**(row.alerts if row and row.alerts else {}))


def targets(doc: dict[str, Any], alert: Alert, row: ClusterSetting | None) -> list[dict[str, Any]]:
    """The enabled channels for this alert: its rule must be on globally and for its cluster."""
    rules = Rules(**doc["rules"])
    if alert.rule not in rules.enabled:
        return []
    route = routing(row) if alert.cluster_id else ClusterAlerts()
    if route.events is not None and alert.rule not in route.events:
        return []
    return [
        c
        for c in doc["channels"]
        if c.get("enabled", True) and (route.channels is None or c["id"] in route.channels)
    ]


async def deliver(channel: dict[str, Any], alert: Alert) -> str | None:
    """Send; returns the error text, or None when it went out."""
    try:
        await asyncio.to_thread(channels.send, channel["type"], decrypted(channel), alert)
    except Exception as exc:
        message = str(exc) or type(exc).__name__
        last_errors[channel["id"]] = message
        logger.warning("Notification to {} failed: {}", channel["name"], message)
        return message
    last_errors.pop(channel["id"], None)
    return None


async def dispatch(session: AsyncSession, alert: Alert, now: datetime | None = None) -> int:
    """Send an alert to its channels unless it is quiet time. Returns how many got it."""
    doc = await load(session)
    if quiet(Rules(**doc["rules"]), now or datetime.now(UTC)):
        return 0
    row = (
        await session.get(ClusterSetting, (DEFAULT_ORG, alert.cluster_id))
        if alert.cluster_id
        else None
    )
    sent = 0
    for channel in targets(doc, alert, row):
        if await deliver(channel, alert) is None:
            sent += 1
    return sent
