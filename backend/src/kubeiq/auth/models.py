"""Auth, user and project API models."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

USERNAME = r"^[a-z0-9]([a-z0-9._@+-]*[a-z0-9])?$"  # an email address works too


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class ProjectAccess(BaseModel):
    project_id: str
    project: str
    role: Literal["viewer", "editor"]


class ScopeAccess(BaseModel):
    cluster_id: str
    namespaces: list[str] | None  # None = all namespaces
    role: Literal["viewer", "editor"]


class Me(BaseModel):
    username: str
    role: Literal["admin", "user"]
    builtin: bool = False  # signs in with the master key, so has no password to change
    projects: list[ProjectAccess] = Field(default_factory=list)
    access: list[ScopeAccess] = Field(default_factory=list)  # empty for admins (they see all)
    changes_enabled: bool = False  # whether cluster changes are turned on for this install
    setup_needed: bool = False  # an admin, and no project yet: show the welcome setup
    auth_provider: Literal["password", "google"] = "password"


class PasswordChangeIn(BaseModel):
    current: str
    new: str = Field(min_length=8, max_length=256)


class UserIn(BaseModel):
    username: str = Field(min_length=2, max_length=254, pattern=USERNAME)
    role: Literal["admin", "user"] = "user"
    password: str | None = Field(default=None, min_length=8, max_length=256)


EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class InviteIn(BaseModel):
    """Allow someone to sign in, by email, with a role (ADR 0013)."""

    email: str = Field(max_length=254, pattern=EMAIL)
    role: Literal["admin", "editor", "viewer"] = "viewer"
    project_id: str | None = None  # editors and viewers; defaults to the only project


class UserUpdate(BaseModel):
    role: Literal["admin", "user"] | None = None
    reset_password: bool = False


class UserOut(BaseModel):
    id: str
    username: str
    role: Literal["admin", "user"]
    builtin: bool  # the master-key admin
    auth_provider: Literal["password", "google"] = "password"
    created_at: datetime
    projects: list[ProjectAccess] = Field(default_factory=list)


class UserCreated(UserOut):
    password: str | None = None  # shown once when generated or reset


class Usage(BaseModel):
    used: int
    max: int


class PlanOut(BaseModel):
    plan: str
    users: Usage
    projects: Usage
    clusters: Usage


class UsersOut(BaseModel):
    users: list[UserOut]
    max_users: int
    plan: str


class Scope(BaseModel):
    cluster_id: str = Field(min_length=1)
    namespaces: list[str] = Field(default_factory=list)  # empty = all namespaces


class Member(BaseModel):
    user_id: str
    role: Literal["viewer", "editor"] = "viewer"


class ProjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    description: str | None = Field(default=None, max_length=500)
    scopes: list[Scope] = Field(default_factory=list)
    members: list[Member] = Field(default_factory=list)


class MemberOut(Member):
    username: str


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str | None
    scopes: list[Scope]
    members: list[MemberOut]
    created_at: datetime


class AuditOut(BaseModel):
    id: int
    created_at: datetime
    username: str
    action: str
    target: str | None
    cluster_id: str | None
    namespace: str | None
    detail: str | None
    ok: bool
