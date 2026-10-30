"""The KubeiQ Agent (ADR 0017).

Admins add a cluster and get a one-time install code. The public routes serve the install
manifest, trade the code for an agent token, and keep the agent's WebSocket tunnel; they accept
nothing but a valid code or token.
"""

import asyncio
import contextlib
import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, status
from fastapi.responses import JSONResponse, PlainTextResponse
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.api.v1.connect import _base_url, _code
from kubeiq.auth import membership
from kubeiq.auth import repository as audit
from kubeiq.auth.deps import AdminUser, require_admin
from kubeiq.clusters import meta
from kubeiq.db.models import AgentCluster, Project
from kubeiq.db.session import get_session, get_sessionmaker
from kubeiq.investigations.models import UtcDatetime
from kubeiq.tunnel import service
from kubeiq.tunnel.hub import LiveAgent, get_hub
from kubeiq.tunnel.mux import Mux

public = APIRouter(prefix="/agent", tags=["agent"])
admin = APIRouter(prefix="/agent/clusters", tags=["agent"], dependencies=[Depends(require_admin)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SEEN_EVERY = 60.0
# A reconnect within this long after a disconnect is not audited again (restarts, blips).
QUIET_RECONNECT = 300.0
_last_down: dict[str, float] = {}


class AgentClusterIn(BaseModel):
    name: str = Field(min_length=1, max_length=40, pattern=service.NAME_PATTERN)
    project_id: str | None = Field(default=None, max_length=36)


class AgentClusterOut(BaseModel):
    name: str
    cluster_id: str
    state: Literal["waiting", "connected", "offline", "revoked"]
    connected_since: UtcDatetime | None = None
    last_seen_at: UtcDatetime | None = None
    agent_version: str | None = None
    kubernetes_version: str | None = None
    registered_at: UtcDatetime | None = None
    revoked_at: UtcDatetime | None = None
    code_expires_at: UtcDatetime | None = None  # an install code is open until then


class AgentCodeOut(BaseModel):
    name: str
    cluster_id: str
    code: str  # shown once, inside the install command
    expires_at: UtcDatetime
    project: str | None = None
    note: str | None = None


def _view(row: AgentCluster) -> AgentClusterOut:
    live = get_hub().get(row.name)
    state: Literal["waiting", "connected", "offline", "revoked"]
    if row.revoked_at is not None:
        state = "revoked"
    elif live is not None:
        state = "connected"
    elif row.registered_at is None:
        state = "waiting"
    else:
        state = "offline"
    return AgentClusterOut(
        name=row.name,
        cluster_id=service.cluster_id(row.name),
        state=state,
        connected_since=live.connected_at if live else None,
        last_seen_at=row.last_seen_at,
        agent_version=(live.version if live and live.version else row.agent_version),
        kubernetes_version=(
            live.kubernetes if live and live.kubernetes else row.kubernetes_version
        ),
        registered_at=row.registered_at,
        revoked_at=row.revoked_at,
        code_expires_at=row.code_expires_at if service.code_usable(row) else None,
    )


async def _row(session: AsyncSession, name: str) -> AgentCluster:
    row = await service.get_row(session, name)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")
    return row


@admin.get("", response_model=list[AgentClusterOut])
async def list_agent_clusters(session: SessionDep) -> list[AgentClusterOut]:
    """Polled by Settings for live status."""
    return [_view(row) for row in await service.list_rows(session)]


@admin.post("", response_model=AgentCodeOut, status_code=status.HTTP_201_CREATED)
async def add_agent_cluster(
    body: AgentClusterIn, session: SessionDep, user: AdminUser
) -> AgentCodeOut:
    """Add a cluster that an agent will connect, and get its one-time install code."""
    if await service.get_row(session, body.name):
        raise HTTPException(status.HTTP_409_CONFLICT, f"'{body.name}' already exists")
    if body.project_id and await session.get(Project, body.project_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    row, code = await service.create(session, body.name, body.project_id, user.username)
    cluster_id = service.cluster_id(row.name)
    project, note = await membership.add_to_project(session, body.project_id, [cluster_id])
    await audit.record(session, user.username, "settings.agent.add", cluster_id=cluster_id)
    assert row.code_expires_at is not None  # noqa: S101 - set by create
    return AgentCodeOut(
        name=row.name,
        cluster_id=cluster_id,
        code=code,
        expires_at=row.code_expires_at,
        project=project,
        note=note,
    )


@admin.post("/{name}/code", response_model=AgentCodeOut)
async def new_install_code(name: str, session: SessionDep, user: AdminUser) -> AgentCodeOut:
    """A new one-time install code: to install again, after a revoke or an expired code."""
    row = await _row(session, name)
    code = await service.new_code(session, row)
    cluster_id = service.cluster_id(row.name)
    await audit.record(session, user.username, "settings.agent.code", cluster_id=cluster_id)
    assert row.code_expires_at is not None  # noqa: S101 - set by new_code
    return AgentCodeOut(
        name=row.name, cluster_id=cluster_id, code=code, expires_at=row.code_expires_at
    )


@admin.post("/{name}/revoke", response_model=AgentClusterOut)
async def revoke_agent(name: str, session: SessionDep, user: AdminUser) -> AgentClusterOut:
    """The agent's token stops working and its tunnel closes now. The cluster stays listed."""
    row = await _row(session, name)
    await service.revoke(session, row)
    await get_hub().disconnect(row.name)
    await audit.record(
        session, user.username, "settings.agent.revoke", cluster_id=service.cluster_id(row.name)
    )
    return _view(row)


@admin.delete("/{name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_cluster(name: str, session: SessionDep, user: AdminUser) -> None:
    row = await _row(session, name)
    cluster_id = service.cluster_id(row.name)
    await service.delete(session, row)
    await get_hub().disconnect(name, "removed")
    await membership.remove(session, cluster_id)
    await meta.forget(session, cluster_id)
    await audit.record(session, user.username, "settings.cluster.remove", cluster_id=cluster_id)


# Public: authorized by an install code or an agent token, never by a session.


def _text(message: str, code: int = 200) -> PlainTextResponse:
    return PlainTextResponse(message + "\n", status_code=code)


@public.get("/install.yaml", response_class=PlainTextResponse)
async def install_manifest(
    request: Request,
    session: SessionDep,
    code: str = "",
    url: str | None = None,
    changes: bool = False,
) -> PlainTextResponse:
    """The manifest the install command applies. Checks the code but does not use it up."""
    try:
        await service.row_for_code(session, code)
    except service.AgentAuthError as exc:
        return _text(str(exc), status.HTTP_401_UNAUTHORIZED)
    address = url or _base_url(request)
    if not service.valid_url(address):
        return _text("The KubeiQ address must be an http(s) URL", 422)
    return PlainTextResponse(
        service.manifest(address, code, changes),
        media_type="application/yaml",
        headers={"Cache-Control": "no-store"},
    )


@public.get("/uninstall.yaml", response_class=PlainTextResponse)
async def uninstall_manifest() -> PlainTextResponse:
    return PlainTextResponse(service.uninstall(), media_type="application/yaml")


@public.post("/register")
async def register_agent(request: Request, session: SessionDep) -> JSONResponse:
    """The agent trades its one-time install code for its token, once."""
    try:
        row, token = await service.register(session, _code(request))
    except service.AgentAuthError as exc:
        return JSONResponse({"detail": str(exc)}, status.HTTP_401_UNAUTHORIZED)
    await audit.record(
        session,
        row.created_by,
        "settings.agent.register",
        cluster_id=service.cluster_id(row.name),
        detail=f"from {request.client.host}" if request.client else None,
    )
    return JSONResponse({"token": token, "cluster": row.name})


class _WebSocketConnection:
    def __init__(self, ws: WebSocket) -> None:
        self._ws = ws

    async def send(self, data: bytes | str) -> None:
        if isinstance(data, bytes):
            await self._ws.send_bytes(data)
        else:
            await self._ws.send_text(data)

    async def receive(self) -> bytes | str | None:
        message = await self._ws.receive()
        if message["type"] == "websocket.disconnect":
            return None
        data: bytes | str | None = message.get("bytes")
        return data if data is not None else message.get("text", "")

    async def close(self, code: int = 1000, reason: str = "") -> None:
        await self._ws.close(code, reason)


def _hello(live: LiveAgent, text: str) -> None:
    try:
        message = json.loads(text)
    except ValueError:
        return
    if isinstance(message, dict) and message.get("type") == "hello":
        version, kubernetes = message.get("version"), message.get("kubernetes")
        live.version = str(version)[:64] if version else live.version
        live.kubernetes = str(kubernetes)[:64] if kubernetes else live.kubernetes


async def _seen(name: str, live: LiveAgent | None) -> None:
    async with get_sessionmaker()() as session:
        row = await service.get_row(session, name)
        if row is not None and row.token_hash is not None:
            await service.seen(
                session, row, live.version if live else None, live.kubernetes if live else None
            )


async def _keep_seen(name: str, live: LiveAgent) -> None:
    await asyncio.sleep(2)  # after the agent's hello, which carries its version
    while True:
        await _seen(name, live)
        await asyncio.sleep(SEEN_EVERY)


@public.websocket("/connect")
async def agent_tunnel(ws: WebSocket) -> None:
    """The agent's tunnel. Closed before the handshake completes unless the token is valid."""
    scheme, _, token = ws.headers.get("authorization", "").partition(" ")
    async with get_sessionmaker()() as session:
        row = await service.row_for_token(session, token.strip()) if scheme == "Bearer" else None
        if row is None:
            await ws.close(code=4401)
            return
        name, owner = row.name, row.created_by
    await ws.accept()
    hub = get_hub()
    mux = Mux(_WebSocketConnection(ws), opener=True)
    live = LiveAgent(mux, address=ws.client.host if ws.client else None)
    mux.on_text = lambda text: _hello(live, text)
    await hub.attach(name, live)
    logger.info("Agent connected for cluster {}", name)
    now = asyncio.get_running_loop().time()
    if now - _last_down.get(name, -QUIET_RECONNECT) >= QUIET_RECONNECT:
        async with get_sessionmaker()() as session:
            await audit.record(
                session,
                owner,
                "settings.agent.connect",
                cluster_id=service.cluster_id(name),
                detail=f"from {live.address}" if live.address else None,
            )
    keeper = asyncio.create_task(_keep_seen(name, live))
    try:
        await mux.run()
    finally:
        keeper.cancel()
        hub.detach(name, mux)
        _last_down[name] = asyncio.get_running_loop().time()
        logger.info("Agent disconnected for cluster {}", name)
        with contextlib.suppress(Exception):
            await _seen(name, live)
