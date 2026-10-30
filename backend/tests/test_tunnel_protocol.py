"""Tunnel framing and multiplexing (ADR 0017), both ends over an in-memory connection."""

import asyncio

import pytest

from kubeiq.tunnel.mux import Mux, Stream, StreamResetError, TunnelClosedError
from kubeiq.tunnel.protocol import (
    INITIAL_WINDOW,
    MAX_DATA,
    Frame,
    Kind,
    ProtocolError,
    credit_of,
    decode,
    encode,
    window,
)


class MemoryConnection:
    """One end of an in-memory message connection."""

    def __init__(self) -> None:
        self.inbox: asyncio.Queue[bytes | str | None] = asyncio.Queue()
        self.peer: MemoryConnection | None = None
        self.closed = False
        self.close_code: int | None = None

    async def send(self, data: bytes | str) -> None:
        assert self.peer is not None
        if self.closed or self.peer.closed:
            raise ConnectionError("closed")
        self.peer.inbox.put_nowait(data)

    async def receive(self) -> bytes | str | None:
        return await self.inbox.get()

    async def close(self, code: int = 1000, reason: str = "") -> None:
        if self.closed:
            return
        self.closed = True
        self.close_code = code
        self.inbox.put_nowait(None)
        assert self.peer is not None
        self.peer.closed = True
        self.peer.close_code = code
        self.peer.inbox.put_nowait(None)


def connection_pair() -> tuple[MemoryConnection, MemoryConnection]:
    a, b = MemoryConnection(), MemoryConnection()
    a.peer, b.peer = b, a
    return a, b


async def tunnel() -> tuple[Mux, Mux, list[asyncio.Task[None]]]:
    """KubeiQ's end (opens streams) and the agent's end (accepts them), both running."""
    ours, theirs = connection_pair()
    kubeiq, agent = Mux(ours, opener=True), Mux(theirs, opener=False)
    tasks = [asyncio.create_task(kubeiq.run()), asyncio.create_task(agent.run())]
    return kubeiq, agent, tasks


async def read_all(stream: Stream) -> bytes:
    out = b""
    while chunk := await stream.read():
        out += chunk
    return out


def test_frames_round_trip() -> None:
    frame = Frame(Kind.DATA, 7, b"hello")
    assert decode(encode(frame)) == frame
    assert encode(Frame(Kind.OPEN, 1)) == b"\x01\x00\x00\x00\x01"
    assert credit_of(decode(encode(window(3, 1024)))) == 1024


@pytest.mark.parametrize(
    "data",
    [
        b"\x01\x00",  # too short
        b"\x09\x00\x00\x00\x01",  # unknown type
        b"\x05\x00\x00\x00\x01\x00",  # window without 4 bytes of credit
        b"\x02\x00\x00\x00\x01" + b"x" * (MAX_DATA + 1),  # data frame too large
    ],
)
def test_bad_frames_are_refused(data: bytes) -> None:
    with pytest.raises(ProtocolError):
        decode(data)


async def test_a_stream_carries_bytes_both_ways() -> None:
    kubeiq, agent, tasks = await tunnel()
    stream = await kubeiq.open()
    await stream.write(b"GET /version HTTP/1.1\r\n\r\n")
    await stream.close()
    accepted = await agent.accept()
    assert await read_all(accepted) == b"GET /version HTTP/1.1\r\n\r\n"
    await accepted.write(b"x" * (MAX_DATA * 3 + 5))  # split into several frames
    await accepted.close()
    assert await read_all(stream) == b"x" * (MAX_DATA * 3 + 5)
    await asyncio.wait_for(stream.done.wait(), 1)
    await asyncio.wait_for(accepted.done.wait(), 1)
    assert kubeiq.stream_count == agent.stream_count == 0
    for task in tasks:
        task.cancel()


async def test_streams_are_independent_and_concurrent() -> None:
    kubeiq, agent, tasks = await tunnel()
    first, second = await kubeiq.open(), await kubeiq.open()
    assert first.id != second.id
    a, b = await agent.accept(), await agent.accept()
    # The second stream answers while the first is still waiting (a watch next to a list).
    await second.write(b"list")
    assert await b.read() == b"list"
    await b.write(b"items")
    assert await second.read() == b"items"
    await first.write(b"watch")
    assert await a.read() == b"watch"
    for task in tasks:
        task.cancel()


async def test_a_sender_waits_for_credit() -> None:
    kubeiq, agent, tasks = await tunnel()
    stream = await kubeiq.open()
    accepted = await agent.accept()
    writer = asyncio.create_task(accepted.write(b"y" * (INITIAL_WINDOW + 100)))
    await asyncio.sleep(0.05)
    assert not writer.done()  # the window is used up and nobody read yet
    received = 0
    while received < INITIAL_WINDOW + 100:
        received += len(await stream.read())  # each read returns credit
    await asyncio.wait_for(writer, 1)
    for task in tasks:
        task.cancel()


async def test_a_peer_that_ignores_flow_control_is_reset() -> None:
    ours, theirs = connection_pair()
    kubeiq = Mux(ours, opener=True)
    task = asyncio.create_task(kubeiq.run())
    stream = await kubeiq.open()
    await theirs.receive()  # the OPEN frame
    for _ in range(INITIAL_WINDOW // MAX_DATA + 1):
        await theirs.send(encode(Frame(Kind.DATA, stream.id, b"z" * MAX_DATA)))
    reply = None
    while reply is None or reply.kind != Kind.RESET:
        message = await asyncio.wait_for(theirs.receive(), 1)
        assert isinstance(message, bytes)
        reply = decode(message)
    assert stream.is_reset
    task.cancel()


async def test_reset_aborts_both_sides() -> None:
    kubeiq, agent, tasks = await tunnel()
    stream = await kubeiq.open()
    accepted = await agent.accept()
    await accepted.abort("gone")
    with pytest.raises(StreamResetError):
        await asyncio.wait_for(stream.read(), 1)
    with pytest.raises(StreamResetError):
        await stream.write(b"more")
    for task in tasks:
        task.cancel()


async def test_closing_the_tunnel_resets_every_stream() -> None:
    kubeiq, agent, tasks = await tunnel()
    stream = await kubeiq.open()
    await agent.accept()
    await agent.close(4401, "revoked")
    await asyncio.wait_for(kubeiq.closed.wait(), 1)
    with pytest.raises(StreamResetError):
        await stream.read()
    with pytest.raises(TunnelClosedError):
        await kubeiq.open()
    with pytest.raises(TunnelClosedError):
        await agent.accept()
    await asyncio.gather(*tasks)


async def test_text_messages_reach_the_handler_and_bad_frames_end_the_tunnel() -> None:
    ours, theirs = connection_pair()
    kubeiq = Mux(ours, opener=True)
    seen: list[str] = []
    kubeiq.on_text = seen.append
    task = asyncio.create_task(kubeiq.run())
    await theirs.send('{"type":"hello"}')
    await theirs.send(b"\x09\x00\x00\x00\x01")
    await asyncio.wait_for(task, 1)
    assert seen == ['{"type":"hello"}']
    assert kubeiq.closed.is_set() and ours.close_code == 1002


async def test_only_the_agent_side_may_be_opened_towards() -> None:
    ours, theirs = connection_pair()
    kubeiq = Mux(ours, opener=True)
    task = asyncio.create_task(kubeiq.run())
    await theirs.send(encode(Frame(Kind.OPEN, 99)))  # an agent must not open streams
    await asyncio.wait_for(task, 1)
    assert kubeiq.closed.is_set()
    with pytest.raises(RuntimeError):
        await Mux(theirs, opener=False).open()
