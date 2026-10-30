"""Many byte streams over one message connection (the agent's WebSocket), with flow control.

Both ends of the protocol live here: KubeiQ opens streams (``opener=True``) and the agent accepts
them. The Go agent implements the accepting end too; the Python one is used by tests.
"""

import asyncio
from collections import deque
from collections.abc import Callable
from typing import Protocol

from loguru import logger

from kubeiq.tunnel.protocol import (
    INITIAL_WINDOW,
    MAX_DATA,
    MAX_STREAM_ID,
    Frame,
    Kind,
    ProtocolError,
    credit_of,
    decode,
    encode,
    window,
)


class Connection(Protocol):
    """A message connection: a WebSocket in production, an in-memory pair in tests."""

    async def send(self, data: bytes | str) -> None: ...

    async def receive(self) -> bytes | str | None:
        """The next message, or None once the connection is closed."""
        ...

    async def close(self, code: int = 1000, reason: str = "") -> None: ...


class TunnelClosedError(ConnectionError):
    pass


class StreamResetError(ConnectionError):
    pass


class Stream:
    def __init__(self, mux: "Mux", stream_id: int) -> None:
        self.id = stream_id
        self._mux = mux
        self._inbox: deque[bytes] = deque()
        self._readable = asyncio.Event()
        self._eof = False  # the peer sent CLOSE
        self._sent_close = False
        self._reset: str | None = None
        self._send_window = INITIAL_WINDOW
        self._window_open = asyncio.Event()
        self._recv_window = INITIAL_WINDOW
        self.done = asyncio.Event()

    @property
    def is_reset(self) -> bool:
        return self._reset is not None

    async def read(self) -> bytes:
        """The next chunk; b"" once the peer closed. Raises StreamResetError if aborted."""
        while True:
            if self._reset is not None:
                raise StreamResetError(self._reset)
            if self._inbox:
                break
            if self._eof:
                return b""
            self._readable.clear()
            await self._readable.wait()
        chunk = self._inbox.popleft()
        self._recv_window += len(chunk)
        try:
            await self._mux.send_frame(window(self.id, len(chunk)))
        except TunnelClosedError:
            pass
        return chunk

    async def write(self, data: bytes) -> None:
        view = memoryview(data)
        while view:
            if self._reset is not None:
                raise StreamResetError(self._reset)
            if self._sent_close:
                raise StreamResetError("stream closed for writing")
            if self._send_window <= 0:
                self._window_open.clear()
                await self._window_open.wait()
                continue
            size = min(len(view), MAX_DATA, self._send_window)
            self._send_window -= size
            await self._mux.send_frame(Frame(Kind.DATA, self.id, bytes(view[:size])))
            view = view[size:]

    async def close(self) -> None:
        """No more data from this side. The stream ends once the peer closes too."""
        if self._sent_close or self._reset is not None:
            return
        self._sent_close = True
        try:
            await self._mux.send_frame(Frame(Kind.CLOSE, self.id))
        except TunnelClosedError:
            self._on_reset("tunnel closed")
            return
        self._maybe_done()

    async def abort(self, reason: str = "") -> None:
        if self._reset is not None:
            return
        self._on_reset(reason or "aborted")
        try:
            await self._mux.send_frame(Frame(Kind.RESET, self.id, reason.encode()[:200]))
        except TunnelClosedError:
            pass

    # Called by the mux for frames from the peer.

    async def _on_data(self, payload: bytes) -> None:
        if len(payload) > self._recv_window or self._eof:
            await self.abort("flow control violated")
            return
        self._recv_window -= len(payload)
        self._inbox.append(payload)
        self._readable.set()

    def _on_close(self) -> None:
        self._eof = True
        self._readable.set()
        self._maybe_done()

    def _on_window(self, credit: int) -> None:
        self._send_window += credit
        self._window_open.set()

    def _on_reset(self, reason: str) -> None:
        if self._reset is None:
            self._reset = reason or "reset by peer"
        self._readable.set()
        self._window_open.set()
        self._finish()

    def _maybe_done(self) -> None:
        if self._sent_close and self._eof:
            self._finish()

    def _finish(self) -> None:
        self._mux._forget(self.id)
        self.done.set()


class Mux:
    def __init__(self, conn: Connection, *, opener: bool) -> None:
        self._conn = conn
        self._opener = opener
        self._streams: dict[int, Stream] = {}
        self._next_id = 1
        self._send_lock = asyncio.Lock()
        self._accepted: asyncio.Queue[Stream | None] = asyncio.Queue()
        self.closed = asyncio.Event()
        self.on_text: Callable[[str], None] | None = None

    @property
    def stream_count(self) -> int:
        return len(self._streams)

    async def open(self) -> Stream:
        if not self._opener:
            raise RuntimeError("only the opener side opens streams")
        if self.closed.is_set():
            raise TunnelClosedError("tunnel closed")
        if self._next_id > MAX_STREAM_ID:
            raise TunnelClosedError("stream ids exhausted")
        stream = Stream(self, self._next_id)
        self._next_id += 1
        self._streams[stream.id] = stream
        await self.send_frame(Frame(Kind.OPEN, stream.id))
        return stream

    async def accept(self) -> Stream:
        stream = await self._accepted.get()
        if stream is None:
            self._accepted.put_nowait(None)  # wake other acceptors too
            raise TunnelClosedError("tunnel closed")
        return stream

    async def send_frame(self, frame: Frame) -> None:
        await self._send(encode(frame))

    async def send_text(self, text: str) -> None:
        await self._send(text)

    async def _send(self, data: bytes | str) -> None:
        if self.closed.is_set():
            raise TunnelClosedError("tunnel closed")
        async with self._send_lock:
            try:
                await self._conn.send(data)
            except Exception as exc:
                self._shutdown()
                raise TunnelClosedError(str(exc)) from exc

    async def run(self) -> None:
        """Read frames until the connection ends; then every open stream is reset."""
        try:
            while not self.closed.is_set():
                message = await self._conn.receive()
                if message is None:
                    break
                if isinstance(message, str):
                    if self.on_text:
                        self.on_text(message)
                    continue
                await self._dispatch(decode(message))
        except ProtocolError as exc:
            logger.warning("Agent tunnel protocol error: {}", exc)
            await self._conn.close(1002, "protocol error")
        except (TunnelClosedError, ConnectionError):
            pass
        finally:
            self._shutdown()

    async def close(self, code: int = 1000, reason: str = "") -> None:
        if not self.closed.is_set():
            self._shutdown()
            try:
                await self._conn.close(code, reason)
            except Exception:
                logger.debug("Closing the agent connection failed")

    async def _dispatch(self, frame: Frame) -> None:
        if frame.kind == Kind.OPEN:
            if self._opener or frame.stream in self._streams:
                raise ProtocolError("unexpected open")
            opened = Stream(self, frame.stream)
            self._streams[frame.stream] = opened
            self._accepted.put_nowait(opened)
            return
        stream = self._streams.get(frame.stream)
        if stream is None:
            return  # a late frame for a stream that already ended
        if frame.kind == Kind.DATA:
            await stream._on_data(frame.payload)
        elif frame.kind == Kind.CLOSE:
            stream._on_close()
        elif frame.kind == Kind.WINDOW:
            stream._on_window(credit_of(frame))
        elif frame.kind == Kind.RESET:
            stream._on_reset(frame.payload.decode("utf-8", "replace"))

    def _forget(self, stream_id: int) -> None:
        self._streams.pop(stream_id, None)

    def _shutdown(self) -> None:
        if self.closed.is_set():
            return
        self.closed.set()
        for stream in list(self._streams.values()):
            stream._on_reset("tunnel closed")
        self._accepted.put_nowait(None)
