"""Persistence models. Every table carries ``org_id`` for future multi-tenancy (ADR 0002)."""

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, ClassVar

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

DEFAULT_ORG = "default"


def _now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict[Any, Any]] = {
        datetime: DateTime(timezone=True),
        dict[str, Any]: JSON,
    }


class InvestigationStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

    @property
    def finished(self) -> bool:
        return self in {InvestigationStatus.COMPLETED, InvestigationStatus.FAILED}


class Investigation(Base):
    __tablename__ = "investigations"
    __table_args__ = (Index("ix_investigations_org_created", "org_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id: Mapped[str] = mapped_column(String(64), default=DEFAULT_ORG, index=True)
    cluster_id: Mapped[str] = mapped_column(String(255), index=True)
    namespace: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default=InvestigationStatus.QUEUED)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    started_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]
    llm_model: Mapped[str | None] = mapped_column(String(255))
    healthy: Mapped[bool | None]
    incident_count: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str | None] = mapped_column(Text)  # top root cause, for history lists
    severity: Mapped[str | None] = mapped_column(String(16))
    report: Mapped[dict[str, Any] | None]
    error: Mapped[str | None] = mapped_column(Text)

    events: Mapped[list["InvestigationEvent"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
        order_by="InvestigationEvent.seq",
    )


class InvestigationEvent(Base):
    __tablename__ = "investigation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    investigation_id: Mapped[str] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer)
    step: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16))
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    investigation: Mapped[Investigation] = relationship(back_populates="events")


class AppSetting(Base):
    """A settings document per org, e.g. key "ai". Secret fields inside are encrypted."""

    __tablename__ = "app_settings"

    org_id: Mapped[str] = mapped_column(String(64), primary_key=True, default=DEFAULT_ORG)
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict[str, Any]]
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


class StoredKubeconfig(Base):
    """A kubeconfig file added in Settings. ``content`` is encrypted."""

    __tablename__ = "kubeconfigs"
    __table_args__ = (UniqueConstraint("org_id", "name", name="uq_kubeconfigs_org_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id: Mapped[str] = mapped_column(String(64), default=DEFAULT_ORG, index=True)
    name: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=_now)
