"""Live agent connections and the local gateway the Kubernetes client talks to (ADR 0017).

The gateway listens on 127.0.0.1 only. Each cluster connected through an agent gets a random
in-memory secret; its ``ApiClient`` sends it as the bearer token, so the gateway knows which
tunnel a connection belongs to, and no other local process can use a tunnel. Every accepted TCP
connection becomes one tunnel stream, copied byte for byte, so plain requests, log follows,
watches and exec upgrades all work. The agent replaces the Authorization header with its own
ServiceAccount token before anything reaches the API server.
"""

import asyncio
import contextlib
import hmac
import json
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import lru_cache

from loguru import logger

from kubeiq.clusters.errors import AGENT_DISCONNECTED, DISCONNECTED_HEADER
from kubeiq.tunnel.mux import Mux, Stream, StreamResetError, TunnelClosedError
from kubeiq.tunnel.protocol import MAX_DATA

HEAD_TIMEOUT = 10.0
HEAD_LIMIT = 64 * 1024
CLOSE_GRACE = 5.0


@dataclass
class LiveAgent:
    mux: Mux
    version: str | None = None
    kubernetes: str | None = None
    address: str | None = None
    connected_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class AgentHub:
    def __init__(self) -> None:
        self._live: dict[str, LiveAgent] = {}
        self._secrets: dict[str, str] = {}  # cluster name -> gateway secret
        self._server: asyncio.Server | None = None
        self._port: int | None = None

    # Live connections

    def get(self, name: str) -> LiveAgent | None:
        agent = self._live.get(name)
        if agent is not None and agent.mux.closed.is_set():
            self._live.pop(name, None)
            return None
        return agent

    async def attach(self, name: str, agent: LiveAgent) -> None:
        """The agent's new connection replaces an older one (a restarted pod reconnecting)."""
        previous = self._live.get(name)
        self._live[name] = agent
        if previous is not None and previous.mux is not agent.mux:
            await previous.mux.close(1000, "replaced by a newer connection")

    def detach(self, name: str, mux: Mux) -> None:
        agent = self._live.get(name)
        if agent is not None and agent.mux is mux:
            self._live.pop(name, None)

    async def disconnect(self, name: str, reason: str = "revoked") -> bool:
        agent = self._live.pop(name, None)
        if agent is None:
            return False
        await agent.mux.close(4401, reason)
        return True

    # Gateway

    @property
    def url(self) -> str:
        if self._port is None:
            raise RuntimeError("The agent gateway is not running")
        return f"http://127.0.0.1:{self._port}"

    def secret(self, name: str) -> str:
        if name not in self._secrets:
            self._secrets[name] = secrets.token_urlsafe(32)
        return self._secrets[name]

    def forget(self, name: str) -> None:
        self._secrets.pop(name, None)

    async def start(self) -> None:
        if self._server is None:
            self._server = await asyncio.start_server(
                self._handle, "127.0.0.1", 0, limit=HEAD_LIMIT
            )
            self._port = self._server.sockets[0].getsockname()[1]

    async def stop(self) -> None:
        for name in list(self._live):
            await self.disconnect(name, "KubeiQ is shutting down")
        if self._server is not None:
            self._server.close()
            self._server = None
            self._port = None

    def _cluster_for(self, head: bytes) -> str | None:
        token = _bearer(head)
        if not token:
            return None
        found = None
        for name, secret in self._secrets.items():
            if hmac.compare_digest(secret.encode(), token.encode()):
                found = name
        return found

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), HEAD_TIMEOUT)
        except (TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError, OSError):
            writer.close()
            return
        name = self._cluster_for(head)
        if name is None:
            await _reply(writer, 401, "Unauthorized", "Not a KubeiQ agent client")
            return
        agent = self.get(name)
        stream = None
        if agent is not None:
            try:
                stream = await agent.mux.open()
                await stream.write(head)
            except (TunnelClosedError, StreamResetError):
                stream = None
        if stream is None:
            await _reply(writer, 503, "Service Unavailable", AGENT_DISCONNECTED, disconnected=True)
            return
        await _pipe(reader, writer, stream)


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, stream: Stream) -> None:
    async def up() -> None:  # the Kubernetes client -> the agent
        try:
            while data := await reader.read(MAX_DATA):
                await stream.write(data)
            await stream.close()
        except (StreamResetError, TunnelClosedError):
            pass
        except OSError:
            await stream.abort("client gone")

    async def down() -> None:  # the agent -> the Kubernetes client
        try:
            while chunk := await stream.read():
                writer.write(chunk)
                await writer.drain()
        except StreamResetError:
            pass
        except OSError:
            await stream.abort("client gone")

    sending = asyncio.create_task(up())
    receiving = asyncio.create_task(down())
    try:
        done, _ = await asyncio.wait({sending, receiving}, return_when=asyncio.FIRST_COMPLETED)
        if receiving not in done:
            # The client finished sending (it closed its socket): give the reply a moment.
            await asyncio.wait({receiving}, timeout=CLOSE_GRACE)
    finally:
        for task in (sending, receiving):
            task.cancel()
        if not stream.done.is_set():
            await stream.abort("closed")
        writer.close()
        with contextlib.suppress(Exception):
            await writer.wait_closed()


def _bearer(head: bytes) -> str | None:
    for line in head.decode("latin-1").split("\r\n")[1:]:
        key, _, value = line.partition(":")
        if key.strip().lower() == "authorization":
            scheme, _, token = value.strip().partition(" ")
            return token.strip() if scheme.lower() == "bearer" else None
    return None


async def _reply(
    writer: asyncio.StreamWriter, code: int, reason: str, message: str, disconnected: bool = False
) -> None:
    """A Kubernetes Status object, so the client raises an ApiException with our message."""
    body = json.dumps(
        {
            "kind": "Status",
            "apiVersion": "v1",
            "status": "Failure",
            "message": message,
            "reason": reason.replace(" ", ""),
            "code": code,
        }
    ).encode()
    extra = f"{DISCONNECTED_HEADER}: disconnected\r\n" if disconnected else ""
    writer.write(
        (
            f"HTTP/1.1 {code} {reason}\r\nContent-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\n{extra}Connection: close\r\n\r\n"
        ).encode()
        + body
    )
    try:
        await writer.drain()
    except OSError:
        logger.debug("Gateway client left before the reply")
    finally:
        writer.close()


@lru_cache
def get_hub() -> AgentHub:
    return AgentHub()
