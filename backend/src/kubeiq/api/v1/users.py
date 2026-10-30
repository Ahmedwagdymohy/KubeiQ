"""User management (admins only). The free plan allows up to 3 users."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import google, plan, repository
from kubeiq.auth.deps import AdminUser
from kubeiq.auth.models import (
    AuditOut,
    InviteIn,
    PlanOut,
    ProjectAccess,
    Usage,
    UserCreated,
    UserIn,
    UserOut,
    UsersOut,
    UserUpdate,
)
from kubeiq.auth.passwords import generate_password, hash_password
from kubeiq.core.config import Settings, get_settings
from kubeiq.db.models import DEFAULT_ORG, AuditEvent, ProjectMember, User
from kubeiq.db.session import get_session

router = APIRouter(tags=["users"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def _builtin(user: User, base: Settings) -> bool:
    return user.username == base.admin_username and user.password_hash is None


async def _sign_ins(session: AsyncSession) -> dict[str, datetime]:
    """The newest successful sign-in per username."""
    rows = await session.execute(
        select(AuditEvent.username, func.max(AuditEvent.created_at))
        .where(AuditEvent.action == "auth.login", AuditEvent.ok.is_(True))
        .group_by(AuditEvent.username)
    )
    return {name: at for name, at in rows.all()}


async def _out(
    session: AsyncSession, user: User, base: Settings, sign_ins: dict[str, datetime] | None = None
) -> UserOut:
    projects = [
        ProjectAccess(project_id=p.id, project=p.name, role=m.role)
        for m, p in await repository.memberships(session, user.id)
    ]
    return UserOut(
        id=user.id,
        username=user.username,
        role=user.role,
        builtin=_builtin(user, base),
        auth_provider="google" if user.auth_provider == "google" else "password",
        created_at=user.created_at,
        projects=projects,
        status="active" if _builtin(user, base) or user.username in (sign_ins or {}) else "invited",
        last_sign_in=(sign_ins or {}).get(user.username),
    )


async def _get(session: AsyncSession, user_id: str) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/plan", response_model=PlanOut)
async def plan_usage(admin: AdminUser, session: SessionDep) -> PlanOut:
    """What the plan allows and what this install uses."""
    projects = await repository.list_projects(session)
    return PlanOut(
        plan=plan.plan_name(),
        users=Usage(used=await repository.count_users(session), max=plan.max_users()),
        projects=Usage(used=len(projects), max=plan.max_projects()),
        clusters=Usage(used=len(repository.clusters_of(projects)), max=plan.max_clusters()),
    )


@router.get("/users", response_model=UsersOut)
async def list_users(admin: AdminUser, session: SessionDep, base: SettingsDep) -> UsersOut:
    await repository.ensure_admin(session, base.admin_username)
    sign_ins = await _sign_ins(session)
    users = [await _out(session, u, base, sign_ins) for u in await repository.list_users(session)]
    return UsersOut(users=users, max_users=plan.max_users(), plan=plan.plan_name())


async def _check_room(session: AsyncSession) -> None:
    if await repository.count_users(session) >= plan.max_users():
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"The {plan.plan_name()} plan allows up to {plan.max_users()} users. "
            "Upgrade to add more.",
        )


@router.post("/users/invite", response_model=UserCreated, status_code=status.HTTP_201_CREATED)
async def invite_user(
    body: InviteIn, admin: AdminUser, session: SessionDep, base: SettingsDep
) -> UserCreated:
    """Allow an email to sign in. With Google sign-in on they use Google; otherwise they get a
    password, shown once. Editors and viewers join the project at once."""
    await repository.ensure_admin(session, base.admin_username)
    await _check_room(session)
    email = body.email.strip().lower()
    if await repository.get_user_by_name(session, email):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{email} is already allowed")
    project = None
    if body.role != "admin":
        projects = await repository.list_projects(session)
        if body.project_id:
            project = next((p for p in projects if p.id == body.project_id), None)
        elif len(projects) == 1:
            project = projects[0]
        if project is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Choose the project they will work in" if projects else "Create a project first",
            )
    with_google = await google.load_config(session) is not None
    password = None if with_google else generate_password()
    user = User(
        username=email,
        role="admin" if body.role == "admin" else "user",
        password_hash=hash_password(password) if password else None,
        auth_provider="google" if with_google else "password",
    )
    session.add(user)
    await session.commit()
    if project is not None:
        members = [
            (m.user_id, m.role) for m, _ in await repository.project_members(session, project.id)
        ]
        await repository.set_members(session, project.id, [*members, (user.id, body.role)])
    await repository.record(session, admin.username, "user.invite", target=email, detail=body.role)
    out = await _out(session, user, base)
    return UserCreated(**out.model_dump(), password=password)


@router.post("/users", response_model=UserCreated, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserIn, admin: AdminUser, session: SessionDep, base: SettingsDep
) -> UserCreated:
    await repository.ensure_admin(session, base.admin_username)
    await _check_room(session)
    if await repository.get_user_by_name(session, body.username):
        raise HTTPException(status.HTTP_409_CONFLICT, f"User {body.username} already exists")
    password = body.password or generate_password()
    user = User(username=body.username, role=body.role, password_hash=hash_password(password))
    session.add(user)
    await session.commit()
    await repository.record(session, admin.username, "user.create", target=body.username)
    out = await _out(session, user, base)
    return UserCreated(**out.model_dump(), password=None if body.password else password)


@router.patch("/users/{user_id}", response_model=UserCreated)
async def update_user(
    user_id: str, body: UserUpdate, admin: AdminUser, session: SessionDep, base: SettingsDep
) -> UserCreated:
    user = await _get(session, user_id)
    if _builtin(user, base):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The built-in admin cannot be changed")
    password = None
    if body.role:
        user.role = body.role
    if body.reset_password:
        password = generate_password()
        user.password_hash = hash_password(password)
    await session.commit()
    if body.reset_password:
        await repository.delete_user_sessions(session, user.id)
    await repository.record(
        session,
        admin.username,
        "user.update",
        target=user.username,
        detail="password reset" if body.reset_password else f"role {user.role}",
    )
    out = await _out(session, user, base)
    return UserCreated(**out.model_dump(), password=password)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str, admin: AdminUser, session: SessionDep, base: SettingsDep
) -> None:
    user = await _get(session, user_id)
    if _builtin(user, base):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The built-in admin cannot be removed")
    if user.id == admin.user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot remove yourself")
    username = user.username
    await repository.delete_user_sessions(session, user.id)
    await session.execute(delete(ProjectMember).where(ProjectMember.user_id == user.id))
    await session.delete(user)
    await session.commit()
    await repository.record(session, admin.username, "user.delete", target=username)


class AuditPage(BaseModel):
    items: list[AuditOut]
    total: int


@router.get("/audit/search", response_model=AuditPage)
async def search_audit(
    admin: AdminUser,
    session: SessionDep,
    username: str | None = None,
    action: str | None = None,
    target_kind: str | None = None,
    cluster_id: str | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
) -> AuditPage:
    """The activity log with filters and pages: who, what (an action or its prefix like
    "k8s."), which kind of target, which cluster, and free text."""
    conditions = [AuditEvent.org_id == DEFAULT_ORG]
    if username:
        conditions.append(AuditEvent.username == username)
    if action:
        conditions.append(
            AuditEvent.action.startswith(action)
            if action.endswith(".")
            else AuditEvent.action == action
        )
    if target_kind:
        conditions.append(AuditEvent.target.startswith(f"{target_kind}/"))
    if cluster_id:
        conditions.append(AuditEvent.cluster_id == cluster_id)
    if q:
        like = f"%{q.lower()}%"
        conditions.append(
            or_(
                func.lower(AuditEvent.target).like(like),
                func.lower(AuditEvent.detail).like(like),
                func.lower(AuditEvent.username).like(like),
                func.lower(AuditEvent.action).like(like),
            )
        )
    total = await session.scalar(select(func.count()).select_from(AuditEvent).where(*conditions))
    rows = await session.execute(
        select(AuditEvent)
        .where(*conditions)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return AuditPage(
        items=[AuditOut.model_validate(e, from_attributes=True) for e in rows.scalars()],
        total=int(total or 0),
    )


@router.get("/audit", response_model=list[AuditOut])
async def audit(
    admin: AdminUser,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[AuditOut]:
    return [
        AuditOut.model_validate(e, from_attributes=True)
        for e in await repository.list_audit(session, limit)
    ]
