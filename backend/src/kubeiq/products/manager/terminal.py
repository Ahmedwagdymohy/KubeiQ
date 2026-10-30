"""The container terminal over a WebSocket (ADR 0009: switch on, editors only, audited).

Browsers send cookies with WebSocket requests from any site, so the Origin must be KubeiQ's own
(or a configured app origin) before the session is trusted.
"""

import asyncio
import json
import threading
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from loguru import logger

from kubeiq.auth import repository
from kubeiq.auth.deps import COOKIE, principal_for
from kubeiq.clusters.registry import get_registry
from kubeiq.core.config import get_settings
from kubeiq.db.session import get_sessionmaker
from kubeiq.products.manager import shell
from kubeiq.products.manager.api import allow_change
from kubeiq.products.manager.kube import resource_path

router = APIRouter(prefix="/manager", tags=["manager"])
RESIZE_CHANNEL = 4


def origin_allowed(origin: str | None, host: str | None) -> bool:
    if not origin:
        return False
    parsed = urlparse(origin)
    if host and parsed.netloc == host:
        return True
    return origin.rstrip("/") in {o.rstrip("/") for o in get_settings().cors_origins}


async def _send(ws: WebSocket, kind: str, **data: Any) -> None:
    await ws.send_text(json.dumps({"type": kind, **data}))


@router.websocket("/exec")
async def terminal(
    ws: WebSocket,
    cluster_id: str,
    namespace: str,
    pod: str,
    container: str,
    confirm: str | None = None,
) -> None:
    await ws.accept()
    if not origin_allowed(ws.headers.get("origin"), ws.headers.get("host")):
        await _send(ws, "error", message="This page may not open a terminal here")
        await ws.close(code=4403)
        return
    registry = get_registry()
    async with get_sessionmaker()() as session:
        token = ws.cookies.get(COOKIE)
        user = await repository.user_for_token(session, token) if token else None
        if user is None:
            await _send(ws, "error", message="Sign in to continue")
            await ws.close(code=4401)
            return
        principal = await principal_for(session, user)
        try:
            resource_path("", "v1", "pods", namespace, pod)
            await allow_change(session, registry, principal, cluster_id, namespace, confirm)
            api = registry.api_client(cluster_id)
        except HTTPException as exc:
            await _send(ws, "error", message=str(exc.detail))
            await ws.close(code=4403)
            return
        except Exception as exc:
            await _send(ws, "error", message=str(exc))
            await ws.close(code=4400)
            return
        await repository.record(
            session,
            principal.username,
            "k8s.exec",
            target=f"pods/{pod}:{container}",
            cluster_id=cluster_id,
            namespace=namespace,
        )

    try:
        client = await asyncio.to_thread(shell.open_shell, api, namespace, pod, container)
    except Exception as exc:
        text = str(exc)
        if "executable file not found" in text or "no such file" in text.lower():
            text = shell.no_shell(pod, namespace, container)
        await _send(ws, "error", message=text)
        await ws.close()
        return

    loop = asyncio.get_running_loop()
    out: asyncio.Queue[str | None] = asyncio.Queue()
    stop = threading.Event()

    def pump() -> None:
        try:
            while client.is_open() and not stop.is_set():
                client.update(timeout=0.2)
                for read in (client.read_stdout, client.read_stderr):
                    try:
                        chunk = read(timeout=0)
                    except Exception:
                        chunk = ""
                    if chunk:
                        loop.call_soon_threadsafe(out.put_nowait, chunk)
        finally:
            loop.call_soon_threadsafe(out.put_nowait, None)

    threading.Thread(target=pump, daemon=True).start()

    async def forward() -> None:
        while (chunk := await out.get()) is not None:
            await _send(ws, "output", data=chunk)
        await _send(ws, "exit")

    sender = asyncio.create_task(forward())
    try:
        while True:
            message = json.loads(await ws.receive_text())
            if message.get("type") == "input":
                client.write_stdin(str(message.get("data", "")))
            elif message.get("type") == "resize":
                size = {
                    "Width": int(message.get("cols", 80)),
                    "Height": int(message.get("rows", 24)),
                }
                client.write_channel(RESIZE_CHANNEL, json.dumps(size))
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception:
        logger.exception("Terminal session failed")
    finally:
        stop.set()
        client.close()
        sender.cancel()
