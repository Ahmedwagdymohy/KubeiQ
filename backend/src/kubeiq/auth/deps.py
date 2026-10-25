"""FastAPI dependencies: who is calling, and may they do this?"""

import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import repository
from kubeiq.auth.access import Access, Action, Grant
from kubeiq.auth.master import is_master_key
from kubeiq.core.config import get_settings
from kubeiq.db.models import User
from kubeiq.db.session import get_session

COOKIE = "kubeiq_session"


@dataclass(frozen=True)
class Principal:
    user_id: str
    username: str
    role: Literal["admin", "user"]
    access: Access

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


async def admin_access(session: AsyncSession) -> Access:
    return Access(admin=True, in_projects=frozenset(await repository.project_clusters(session)))


async def principal_for(session: AsyncSession, user: User) -> Principal:
    if user.role == "admin":
        return Principal(user.id, user.username, "admin", await admin_access(session))
    grants = []
    for member, project in await repository.memberships(session, user.id):
        for scope in repository.scopes_of(project):
            names = scope.get("namespaces") or []
            grants.append(
                Grant(
                    cluster_id=scope["cluster_id"],
                    namespaces=frozenset(names) if names else None,
                    role="editor" if member.role == "editor" else "viewer",
                )
            )
    return Principal(user.id, user.username, "user", Access(grants=tuple(grants)))


async def current_principal(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> Principal:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        if is_master_key(auth[7:].strip()):
            # API calls with the master key act as the built-in admin without touching the DB.
            return Principal(
                "master", get_settings().admin_username, "admin", await admin_access(session)
            )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    token = request.cookies.get(COOKIE)
    user = await repository.user_for_token(session, token) if token else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue")
    return await principal_for(session, user)


CurrentUser = Annotated[Principal, Depends(current_principal)]


async def require_admin(user: CurrentUser) -> Principal:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can do this")
    return user


AdminUser = Annotated[Principal, Depends(require_admin)]


def check(user: Principal, action: Action, cluster_id: str, namespace: str | None) -> None:
    """Raise 403 unless the user's projects allow this cluster and namespace."""
    if not user.access.can(action, cluster_id, namespace):
        where = f"namespace {namespace}" if namespace else "all namespaces"
        verb = "change" if action == "edit" else "view"
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Your projects do not allow you to {verb} {where} here"
        )


class LoginThrottle:
    """At most 5 failed sign-ins per username per 5 minutes."""

    def __init__(self, limit: int = 5, window: float = 300) -> None:
        self.limit, self.window = limit, window
        self._failures: dict[str, deque[float]] = defaultdict(deque)

    def blocked(self, username: str) -> bool:
        attempts = self._failures[username]
        while attempts and time.monotonic() - attempts[0] > self.window:
            attempts.popleft()
        return len(attempts) >= self.limit

    def failed(self, username: str) -> None:
        self._failures[username].append(time.monotonic())

    def reset(self, username: str) -> None:
        self._failures.pop(username, None)


throttle = LoginThrottle()
