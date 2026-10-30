"""Per-cluster settings admins choose: display name, labels, default namespace, thresholds."""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.db.models import DEFAULT_ORG, ClusterSetting

__all__ = ["ClusterSetting"]

COLORS = ("red", "amber", "blue", "green", "violet", "cyan", "pink", "slate")
Color = Literal["red", "amber", "blue", "green", "violet", "cyan", "pink", "slate"]
PRESETS: dict[str, Color] = {
    "production": "red",
    "staging": "amber",
    "development": "blue",
    "testing": "violet",
    "monitoring": "cyan",
    "internal": "slate",
    "external": "green",
    "critical": "red",
    "legacy": "slate",
}
PRODUCTION = "production"
MAX_LABELS = 10
_LABEL = re.compile(r"^[a-z0-9][a-z0-9 ._-]{0,23}$")
_NAMESPACE = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")


class Label(BaseModel):
    name: str
    color: Color

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip().lower()
        if not _LABEL.fullmatch(value):
            raise ValueError("Labels are up to 24 lowercase letters, digits, spaces, . _ or -")
        return value


class Thresholds(BaseModel):
    warning: int = Field(default=60, ge=1, le=99)
    critical: int = Field(default=80, ge=2, le=100)

    @model_validator(mode="after")
    def _ordered(self) -> "Thresholds":
        if self.warning >= self.critical:
            raise ValueError("The warning level must be below the critical level")
        return self


class ClusterMeta(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    labels: list[Label] = Field(default_factory=list, max_length=MAX_LABELS)
    namespace: str | None = Field(default=None, max_length=253)
    metrics: bool = True
    cpu: Thresholds = Field(default_factory=Thresholds)
    memory: Thresholds = Field(default_factory=Thresholds)

    @field_validator("display_name")
    @classmethod
    def _display(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None

    @field_validator("namespace")
    @classmethod
    def _namespace(cls, value: str | None) -> str | None:
        value = (value or "").strip() or None
        if value and not _NAMESPACE.fullmatch(value):
            raise ValueError(f"'{value}' is not a valid namespace name")
        return value

    @field_validator("labels")
    @classmethod
    def _unique(cls, labels: list[Label]) -> list[Label]:
        seen: dict[str, Label] = {}
        for label in labels:
            seen.setdefault(label.name, label)
        return list(seen.values())

    @property
    def production(self) -> bool:
        return any(label.name == PRODUCTION for label in self.labels)


def to_meta(row: ClusterSetting | None) -> ClusterMeta:
    if row is None:
        return ClusterMeta()
    return ClusterMeta(
        display_name=row.display_name,
        labels=[Label(**label) for label in row.labels or []],
        namespace=row.namespace,
        metrics=row.metrics,
        cpu=Thresholds(warning=row.cpu_warning, critical=row.cpu_critical),
        memory=Thresholds(warning=row.memory_warning, critical=row.memory_critical),
    )


async def all_rows(session: AsyncSession) -> dict[str, ClusterSetting]:
    rows = await session.execute(select(ClusterSetting).where(ClusterSetting.org_id == DEFAULT_ORG))
    return {row.cluster_id: row for row in rows.scalars()}


async def seen(session: AsyncSession, cluster_ids: list[str]) -> dict[str, ClusterSetting]:
    """Every row for these clusters, creating the missing ones (that records when it was added)."""
    rows = await all_rows(session)
    missing = [cid for cid in cluster_ids if cid not in rows]
    for cluster_id in missing:
        rows[cluster_id] = ClusterSetting(cluster_id=cluster_id, labels=[], alerts={})
        session.add(rows[cluster_id])
    if missing:
        await session.commit()
    return rows


async def get(session: AsyncSession, cluster_id: str) -> ClusterMeta:
    return to_meta(await session.get(ClusterSetting, (DEFAULT_ORG, cluster_id)))


async def save(session: AsyncSession, cluster_id: str, meta: ClusterMeta) -> None:
    row = await session.get(ClusterSetting, (DEFAULT_ORG, cluster_id))
    if row is None:
        row = ClusterSetting(cluster_id=cluster_id, alerts={})
        session.add(row)
    row.display_name = meta.display_name
    row.labels = [label.model_dump() for label in meta.labels]
    row.namespace = meta.namespace
    row.metrics = meta.metrics
    row.cpu_warning, row.cpu_critical = meta.cpu.warning, meta.cpu.critical
    row.memory_warning, row.memory_critical = meta.memory.warning, meta.memory.critical
    await session.commit()


async def forget(session: AsyncSession, cluster_id: str) -> None:
    row = await session.get(ClusterSetting, (DEFAULT_ORG, cluster_id))
    if row is not None:
        await session.delete(row)
        await session.commit()
