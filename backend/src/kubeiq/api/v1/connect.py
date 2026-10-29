"""Connect a cluster with one command (ADR 0014).

Admins create a one-time code in Settings. The public routes serve connect.sh and take the
kubeconfig it creates; they accept nothing but a valid code, and each code connects one cluster.
"""

import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import repository as auth_repository
from kubeiq.auth.deps import AdminUser, require_admin
from kubeiq.connect import service
from kubeiq.db.models import Project
from kubeiq.db.session import get_session
from kubeiq.investigations.models import UtcDatetime

public = APIRouter(tags=["connect"])
admin = APIRouter(prefix="/connect/codes", tags=["connect"], dependencies=[Depends(require_admin)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
_HOST = re.compile(r"^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$")


class CodeIn(BaseModel):
    project_id: str | None = Field(default=None, max_length=36)
    # Fix: the connected cluster takes this one's place in its projects, and this one is hidden.
    replaces: str | None = Field(default=None, max_length=512)


class CodeOut(BaseModel):
    id: str
    code: str  # shown once, inside the command
    expires_at: UtcDatetime
    project: str | None


class CodeStatus(BaseModel):
    state: Literal["waiting", "connected", "failed", "expired"]
    expires_at: UtcDatetime
    cluster_id: str | None = None
    cluster: str | None = None
    version: str | None = None
    error: str | None = None
    note: str | None = None


@admin.post("", response_model=CodeOut, status_code=status.HTTP_201_CREATED)
async def create_code(body: CodeIn, session: SessionDep, user: AdminUser) -> CodeOut:
    """A code for one cluster, for the given project (or the only one there is)."""
    project = await session.get(Project, body.project_id) if body.project_id else None
    if body.project_id and project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if project is None:
        projects = await auth_repository.list_projects(session)
        project = projects[0] if len(projects) == 1 else None
    row, code = await service.create_code(
        session, user.username, project.id if project else None, body.replaces
    )
    return CodeOut(
        id=row.id, code=code, expires_at=row.expires_at, project=project.name if project else None
    )


@admin.get("/{code_id}", response_model=CodeStatus)
async def code_status(code_id: str, session: SessionDep) -> CodeStatus:
    """Polled by Settings while the command runs."""
    row = await service.get_code(session, code_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Code not found")
    if row.state == "connected" and row.cluster_id:
        name = row.cluster_id.removeprefix("upload:").split("/", 1)[0]
        return CodeStatus(
            state="connected",
            expires_at=row.expires_at,
            cluster_id=row.cluster_id,
            cluster=name,
            version=row.detail,
            note=row.note,
        )
    if service.expired(row):
        return CodeStatus(state="expired", expires_at=row.expires_at, error=row.detail)
    state: Literal["waiting", "failed"] = "failed" if row.state == "failed" else "waiting"
    return CodeStatus(state=state, expires_at=row.expires_at, error=row.detail)


def _base_url(request: Request) -> str:
    """The address this request reached KubeiQ at (behind the proxy too)."""
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    host = host.split(",")[0].strip()
    if proto not in ("http", "https") or not _HOST.match(host):
        proto, host = request.url.scheme, request.url.netloc
    return f"{proto}://{host}"


def _code(request: Request) -> str:
    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    return value.strip() if scheme.lower() == "bearer" else ""


def _text(message: str, code: int = 200) -> PlainTextResponse:
    return PlainTextResponse(message + "\n", status_code=code)


@public.get("/connect.sh", response_class=PlainTextResponse)
async def connect_script(request: Request) -> PlainTextResponse:
    return PlainTextResponse(
        service.script(_base_url(request)),
        media_type="text/x-shellscript",
        headers={"Cache-Control": "no-store"},
    )


@public.get("/connect/rbac/{file}", response_class=PlainTextResponse)
async def rbac(file: str) -> PlainTextResponse:
    if file not in service.RBAC_FILES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return PlainTextResponse(
        (service.ASSETS / "rbac" / file).read_text(), media_type="application/yaml"
    )


@public.get("/connect/check", response_class=PlainTextResponse)
async def check_code(request: Request, session: SessionDep) -> PlainTextResponse:
    """connect.sh asks first, so an expired code fails before anything is created."""
    try:
        await service.usable_code(session, _code(request))
    except service.ConnectError as exc:
        return _text(str(exc), exc.status)
    return _text("ok")


@public.post("/connect", response_class=PlainTextResponse)
async def connect_cluster(
    request: Request, session: SessionDep, name: str | None = None
) -> PlainTextResponse:
    """Takes the kubeconfig connect.sh created. Replies in plain text, for the script to show."""
    try:
        row = await service.usable_code(session, _code(request))
    except service.ConnectError as exc:
        return _text(str(exc), exc.status)
    body = await request.body()
    if len(body) > service.MAX_KUBECONFIG_BYTES:
        return _text("The kubeconfig is too large", status.HTTP_413_CONTENT_TOO_LARGE)
    try:
        connected = await service.connect(session, row, body.decode("utf-8", "replace"), name)
    except service.ConnectError as exc:
        return _text(str(exc), exc.status)
    return _text(connected.message)
