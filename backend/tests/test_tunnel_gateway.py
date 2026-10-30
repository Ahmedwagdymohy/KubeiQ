"""The agent gateway: the unchanged Kubernetes client reaches a cluster through a tunnel.

A Python stand-in for the agent accepts the tunnel's streams and pipes each one to a fake API
server, the way the Go agent serves them with its reverse proxy.
"""

import asyncio
import contextlib
import json
import threading
import time
from collections.abc import AsyncIterator, Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest
from kubernetes.client import CoreV1Api, VersionApi
from kubernetes.client.exceptions import ApiException

from kubeiq.clusters.agent import AgentSource
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.errors import AGENT_DISCONNECTED, describe_error
from kubeiq.tunnel.hub import AgentHub, LiveAgent
from kubeiq.tunnel.mux import Mux, Stream, StreamResetError, TunnelClosedError
from tests.test_tunnel_protocol import connection_pair

VERSION = {
    "major": "1",
    "minor": "31",
    "gitVersion": "v1.31.0",
    "gitCommit": "abc",
    "gitTreeState": "clean",
    "buildDate": "2026-01-01T00:00:00Z",
    "goVersion": "go1.24",
    "compiler": "gc",
    "platform": "linux/arm64",
}


class FakeApiServer(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive, like the real API server
    seen: list[dict[str, str]] = []  # noqa: RUF012 - shared by the test

    def log_message(self, *args: Any) -> None:
        pass

    def _json(self, body: dict[str, Any]) -> None:
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        FakeApiServer.seen.append({k.lower(): v for k, v in self.headers.items()})
        if self.path.rstrip("/") == "/version":
            self._json(VERSION)
        elif self.path.startswith("/api/v1/namespaces/default/pods/web/log"):
            # A followed log: chunks arrive over time on one response.
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            for n in range(3):
                line = f"line {n}\n".encode()
                self.wfile.write(f"{len(line):x}\r\n".encode() + line + b"\r\n")
                self.wfile.flush()
                time.sleep(0.05)
            self.wfile.write(b"0\r\n\r\n")
        elif self.path.startswith("/api/v1/namespaces"):
            time.sleep(0.2 if "slow" in self.path else 0)
            self._json({"kind": "NamespaceList", "apiVersion": "v1", "metadata": {}, "items": []})
        else:
            self.send_error(404)


@pytest.fixture
def api_server() -> Iterator[int]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeApiServer)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    FakeApiServer.seen = []
    yield server.server_address[1]
    server.shutdown()


async def serve_stream(stream: Stream, port: int) -> None:
    reader, writer = await asyncio.open_connection("127.0.0.1", port)

    async def up() -> None:
        with contextlib.suppress(StreamResetError, ConnectionError):
            while chunk := await stream.read():
                writer.write(chunk)
                await writer.drain()
        writer.close()

    async def down() -> None:
        with contextlib.suppress(StreamResetError, TunnelClosedError, ConnectionError):
            while data := await reader.read(65536):
                await stream.write(data)
            await stream.close()

    await asyncio.gather(up(), down())


async def fake_agent(mux: Mux, port: int) -> None:
    tasks = set()
    with contextlib.suppress(TunnelClosedError):
        while True:
            stream = await mux.accept()
            task = asyncio.create_task(serve_stream(stream, port))
            tasks.add(task)
            task.add_done_callback(tasks.discard)


@pytest.fixture
async def hub() -> AsyncIterator[AgentHub]:
    hub = AgentHub()
    await hub.start()
    yield hub
    await hub.stop()


async def connect_agent(
    hub: AgentHub, name: str, port: int
) -> tuple[Mux, list[asyncio.Task[None]]]:
    ours, theirs = connection_pair()
    kubeiq, agent = Mux(ours, opener=True), Mux(theirs, opener=False)
    await hub.attach(name, LiveAgent(kubeiq, version="0.4.0"))
    tasks = [asyncio.create_task(kubeiq.run()), asyncio.create_task(fake_agent(agent, port))]
    tasks.append(asyncio.create_task(agent.run()))
    return kubeiq, tasks


def source_for(hub: AgentHub, *names: str) -> AgentSource:
    source = AgentSource(hub)
    source.set_entries([{"name": name} for name in names])
    return source


async def test_the_kubernetes_client_works_through_the_tunnel(
    hub: AgentHub, api_server: int
) -> None:
    source = source_for(hub, "edge")
    assert [c.id for c in source.list_clusters()] == ["agent:edge"]
    await connect_agent(hub, "edge", api_server)
    client = source.api_client("agent:edge")

    info = await asyncio.to_thread(VersionApi(client).get_code)
    assert info.git_version == "v1.31.0"
    namespaces = await asyncio.to_thread(CoreV1Api(client).list_namespace)
    assert namespaces.items == []
    # The gateway knew the cluster by the client's secret; the agent replaces it with its own.
    assert FakeApiServer.seen[0]["authorization"] == f"Bearer {hub.secret('edge')}"


async def test_streamed_and_concurrent_requests(hub: AgentHub, api_server: int) -> None:
    source = source_for(hub, "edge")
    await connect_agent(hub, "edge", api_server)
    api = CoreV1Api(source.api_client("agent:edge"))

    def follow() -> list[str]:
        response = api.read_namespaced_pod_log(
            "web", "default", follow=True, _preload_content=False
        )
        lines = [chunk.decode() for chunk in response.stream(16)]
        response.release_conn()
        return lines

    def slow() -> float:
        started = time.monotonic()
        api.list_namespace(label_selector="slow")
        return time.monotonic() - started

    started = time.monotonic()
    logs, *durations = await asyncio.gather(
        asyncio.to_thread(follow), *(asyncio.to_thread(slow) for _ in range(4))
    )
    assert "".join(logs) == "line 0\nline 1\nline 2\n"
    assert all(d >= 0.2 for d in durations)
    assert time.monotonic() - started < 0.7  # four slow lists ran side by side, not in turn


async def test_a_disconnected_agent_gives_a_clear_error_and_reconnects(
    hub: AgentHub, api_server: int
) -> None:
    source = source_for(hub, "edge")
    client = source.api_client("agent:edge")
    with pytest.raises(ApiException) as caught:
        await asyncio.to_thread(VersionApi(client).get_code)
    assert caught.value.status == 503
    assert describe_error(caught.value) == AGENT_DISCONNECTED

    mux, _ = await connect_agent(hub, "edge", api_server)
    assert (await asyncio.to_thread(VersionApi(client).get_code)).git_version == "v1.31.0"

    # The pod restarts: the tunnel drops, a new one comes, and the same client keeps working.
    await mux.close()
    with pytest.raises(Exception):  # noqa: B017 - the pooled connection breaks, any error
        await asyncio.to_thread(VersionApi(client).get_code)
    await connect_agent(hub, "edge", api_server)
    assert (await asyncio.to_thread(VersionApi(client).get_code)).git_version == "v1.31.0"


async def test_a_newer_connection_replaces_the_old_one(hub: AgentHub, api_server: int) -> None:
    old, _ = await connect_agent(hub, "edge", api_server)
    new, _ = await connect_agent(hub, "edge", api_server)
    assert old.closed.is_set() and not new.closed.is_set()
    live = hub.get("edge")
    assert live is not None and live.mux is new
    hub.detach("edge", old)  # the old connection's cleanup must not drop the new one
    assert hub.get("edge") is not None
    assert await hub.disconnect("edge")
    assert hub.get("edge") is None and new.closed.is_set()


async def test_the_gateway_refuses_unknown_clients(hub: AgentHub) -> None:
    hub.secret("edge")
    reader, writer = await asyncio.open_connection("127.0.0.1", int(hub.url.rsplit(":", 1)[1]))
    writer.write(b"GET /version HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer guess\r\n\r\n")
    await writer.drain()
    reply = await reader.read()
    assert reply.startswith(b"HTTP/1.1 401")
    writer.close()


async def test_the_source_knows_only_its_clusters(hub: AgentHub) -> None:
    source = source_for(hub, "edge")
    with pytest.raises(ClusterNotFoundError):
        source.api_client("agent:other")
    first = source.api_client("agent:edge")
    assert source.api_client("agent:edge") is first
    assert first.configuration.host == hub.url
    source.set_entries([])
    with pytest.raises(ClusterNotFoundError):
        source.api_client("agent:edge")
