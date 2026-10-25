"""Database access for users, sessions, projects and audit events."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.db.models import (
    DEFAULT_ORG,
    AuditEvent,
    AuthSession,
    Project,
    ProjectMember,
    User,
)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def get_user_by_name(session: AsyncSession, username: str) -> User | None:
    query = select(User).where(User.org_id == DEFAULT_ORG, User.username == username)
    return (await session.execute(query)).scalar_one_or_none()


async def ensure_admin(session: AsyncSession, username: str) -> User:
    """The built-in admin row (password is the master key, so no hash is stored)."""
    user = await get_user_by_name(session, username)
    if user is None:
        user = User(username=username, role="admin", password_hash=None)
        session.add(user)
        await session.commit()
    return user


async def list_users(session: AsyncSession) -> list[User]:
    query = select(User).where(User.org_id == DEFAULT_ORG).order_by(User.created_at)
    return list((await session.execute(query)).scalars())


async def count_users(session: AsyncSession) -> int:
    query = select(func.count()).select_from(User).where(User.org_id == DEFAULT_ORG)
    return int((await session.execute(query)).scalar_one())


async def create_session(session: AsyncSession, user: User, days: int) -> str:
    token = secrets.token_urlsafe(32)
    session.add(
        AuthSession(
            token_hash=token_hash(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=days),
        )
    )
    await session.commit()
    return token


async def user_for_token(session: AsyncSession, token: str) -> User | None:
    row = await session.get(AuthSession, token_hash(token))
    if row is None:
        return None
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        await session.delete(row)
        await session.commit()
        return None
    return await session.get(User, row.user_id)


async def delete_session(session: AsyncSession, token: str) -> None:
    await session.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash(token)))
    await session.commit()


async def delete_user_sessions(session: AsyncSession, user_id: str) -> None:
    await session.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
    await session.commit()


async def memberships(session: AsyncSession, user_id: str) -> list[tuple[ProjectMember, Project]]:
    query = (
        select(ProjectMember, Project)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(ProjectMember.user_id == user_id)
    )
    return [(m, p) for m, p in (await session.execute(query)).all()]


async def list_projects(session: AsyncSession) -> list[Project]:
    query = select(Project).where(Project.org_id == DEFAULT_ORG).order_by(Project.name)
    return list((await session.execute(query)).scalars())


async def project_members(
    session: AsyncSession, project_id: str
) -> list[tuple[ProjectMember, User]]:
    query = (
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(User.username)
    )
    return [(m, u) for m, u in (await session.execute(query)).all()]


async def set_members(
    session: AsyncSession, project_id: str, members: list[tuple[str, str]]
) -> None:
    await session.execute(delete(ProjectMember).where(ProjectMember.project_id == project_id))
    for user_id, role in members:
        session.add(ProjectMember(project_id=project_id, user_id=user_id, role=role))
    await session.commit()


async def record(
    session: AsyncSession,
    username: str,
    action: str,
    *,
    target: str | None = None,
    cluster_id: str | None = None,
    namespace: str | None = None,
    detail: str | None = None,
    ok: bool = True,
) -> None:
    session.add(
        AuditEvent(
            username=username,
            action=action,
            target=target,
            cluster_id=cluster_id,
            namespace=namespace,
            detail=detail,
            ok=ok,
        )
    )
    await session.commit()


async def list_audit(session: AsyncSession, limit: int = 100) -> list[AuditEvent]:
    query = (
        select(AuditEvent)
        .where(AuditEvent.org_id == DEFAULT_ORG)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(limit)
    )
    return list((await session.execute(query)).scalars())


def scopes_of(project: Project) -> list[dict[str, Any]]:
    return list(project.scopes or [])


def clusters_of(projects: list[Project]) -> set[str]:
    """Distinct clusters across projects: the clusters KubeiQ works with (ADR 0012)."""
    return {scope["cluster_id"] for p in projects for scope in scopes_of(p)}


async def project_clusters(session: AsyncSession) -> set[str]:
    return clusters_of(await list_projects(session))
