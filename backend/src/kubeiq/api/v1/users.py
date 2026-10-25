"""User management (admins only). The free plan allows up to 3 users."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import plan, repository
from kubeiq.auth.deps import AdminUser
from kubeiq.auth.models import (
    AuditOut,
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
from kubeiq.db.models import ProjectMember, User
from kubeiq.db.session import get_session

router = APIRouter(tags=["users"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def _builtin(user: User, base: Settings) -> bool:
    return user.username == base.admin_username and user.password_hash is None


async def _out(session: AsyncSession, user: User, base: Settings) -> UserOut:
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
    users = [await _out(session, u, base) for u in await repository.list_users(session)]
    return UsersOut(users=users, max_users=plan.max_users(), plan=plan.plan_name())


@router.post("/users", response_model=UserCreated, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserIn, admin: AdminUser, session: SessionDep, base: SettingsDep
) -> UserCreated:
    await repository.ensure_admin(session, base.admin_username)
    if await repository.count_users(session) >= plan.max_users():
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"The {plan.plan_name()} plan allows up to {plan.max_users()} users. "
            "Upgrade to add more.",
        )
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
