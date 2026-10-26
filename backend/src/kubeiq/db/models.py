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


class IncidentMessage(Base):
    """One message in the follow-up chat on an incident of an investigation."""

    __tablename__ = "incident_messages"
    __table_args__ = (Index("ix_incident_messages_thread", "investigation_id", "incident_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[str] = mapped_column(String(64), default=DEFAULT_ORG)
    investigation_id: Mapped[str] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE")
    )
    incident_id: Mapped[str] = mapped_column(String(512))
    role: Mapped[str] = mapped_column(String(16))  # "user" or "assistant"
    author: Mapped[str | None] = mapped_column(String(254))  # who asked; None for answers
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=_now)


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


class User(Base):
    """A person who can sign in. The built-in admin signs in with the master key instead."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("org_id", "username", name="uq_users_org_username"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id: Mapped[str] = mapped_column(String(64), default=DEFAULT_ORG, index=True)
    username: Mapped[str] = mapped_column(String(254))  # may be an email address
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="user")  # "admin" or "user"
    # "password", or "google" for accounts created by Google sign-in (ADR 0013)
    auth_provider: Mapped[str] = mapped_column(
        String(16), default="password", server_default="password"
    )
    created_at: Mapped[datetime] = mapped_column(default=_now)


class AuthSession(Base):
    """A signed-in browser. Only a hash of the cookie token is stored."""

    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    expires_at: Mapped[datetime]


class Project(Base):
    """Access boundary: which clusters and namespaces its members can use."""

    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("org_id", "name", name="uq_projects_org_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id: Mapped[str] = mapped_column(String(64), default=DEFAULT_ORG, index=True)
    name: Mapped[str] = mapped_column(String(64))
    description: Mapped[str | None] = mapped_column(Text)
    # [{"cluster_id": "...", "namespaces": ["shop", "payments"]}]; empty namespaces = all
    scopes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=_now)


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[str] = mapped_column(String(16), default="viewer")  # "viewer" or "editor"


class AuditEvent(Base):
    """Who did what: sign-ins, settings and access changes, and every change to a cluster."""

    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_org_created", "org_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[str] = mapped_column(String(64), default=DEFAULT_ORG)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    username: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64))  # e.g. "auth.login", "k8s.scale"
    target: Mapped[str | None] = mapped_column(String(512))
    cluster_id: Mapped[str | None] = mapped_column(String(255))
    namespace: Mapped[str | None] = mapped_column(String(255))
    detail: Mapped[str | None] = mapped_column(Text)
    ok: Mapped[bool] = mapped_column(default=True)
