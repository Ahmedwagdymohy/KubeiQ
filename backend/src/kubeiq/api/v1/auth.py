"""Sign in with a username and password. The built-in admin uses the master key."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import repository
from kubeiq.auth.deps import COOKIE, CurrentUser, principal_for, throttle
from kubeiq.auth.master import is_master_key
from kubeiq.auth.models import LoginIn, Me, PasswordChangeIn, ProjectAccess, ScopeAccess
from kubeiq.auth.passwords import hash_password, verify_password
from kubeiq.core.config import Settings, get_settings
from kubeiq.db.models import User
from kubeiq.db.session import get_session
from kubeiq.settings.service import changes_enabled

router = APIRouter(prefix="/auth", tags=["auth"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


async def _me(session: AsyncSession, user_id: str, username: str, role: str) -> Me:
    projects = [
        ProjectAccess(project_id=p.id, project=p.name, role=m.role)
        for m, p in await repository.memberships(session, user_id)
    ]
    row = await session.get(User, user_id)
    grants = (await principal_for(session, row)).access.grants if row else ()
    access = [
        ScopeAccess(
            cluster_id=g.cluster_id,
            namespaces=sorted(g.namespaces) if g.namespaces is not None else None,
            role=g.role,
        )
        for g in grants
    ]
    return Me(
        access=access,
        username=username,
        builtin=row is None or row.password_hash is None,
        role=role,
        projects=projects,
        changes_enabled=await changes_enabled(session),
        setup_needed=role == "admin" and not await repository.list_projects(session),
    )


@router.post("/login", response_model=Me)
async def login(
    body: LoginIn, request: Request, response: Response, session: SessionDep, base: SettingsDep
) -> Me:
    username = body.username.strip().lower()
    if throttle.blocked(username):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again in a few minutes."
        )
    user: User | None
    if username == base.admin_username and is_master_key(body.password):
        user = await repository.ensure_admin(session, username)
    else:
        found = await repository.get_user_by_name(session, username)
        user = found if found and verify_password(body.password, found.password_hash) else None
    if user is None:
        throttle.failed(username)
        await repository.record(session, username, "auth.login", ok=False)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")

    throttle.reset(username)
    token = await repository.create_session(session, user, base.session_days)
    response.set_cookie(
        COOKIE,
        token,
        max_age=base.session_days * 86400,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        path="/",
    )
    await repository.record(session, user.username, "auth.login")
    return await _me(session, user.id, user.username, user.role)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, session: SessionDep) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        await repository.delete_session(session, token)
    response.delete_cookie(COOKIE, path="/")


@router.get("/me", response_model=Me)
async def me(user: CurrentUser, session: SessionDep) -> Me:
    return await _me(session, user.user_id, user.username, user.role)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: PasswordChangeIn, user: CurrentUser, session: SessionDep) -> None:
    row = await repository.get_user_by_name(session, user.username)
    if row is None or row.password_hash is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "This account signs in with the master key"
        )
    if not verify_password(body.current, row.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is wrong")
    row.password_hash = hash_password(body.new)
    await session.commit()
    await repository.record(session, user.username, "auth.password")
