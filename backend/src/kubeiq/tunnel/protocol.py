"""Tunnel framing (ADR 0017). The Go agent in agent/ implements the same format.

Every binary WebSocket message is one frame: a 1-byte type, a 4-byte big-endian stream id, then
the payload. Only KubeiQ opens streams. Flow control is per stream and per direction: a sender
may have at most ``INITIAL_WINDOW`` unacknowledged bytes in flight, and the receiver returns
credit with ``WINDOW`` frames as it hands data on. Text messages carry JSON control messages
(the agent's ``hello``).
"""

import struct
from dataclasses import dataclass
from enum import IntEnum

VERSION = 1
HEADER = struct.Struct(">BI")
CREDIT = struct.Struct(">I")
MAX_DATA = 32 * 1024  # largest DATA payload
INITIAL_WINDOW = 256 * 1024  # bytes a sender may have in flight per stream
MAX_STREAM_ID = 2**32 - 1


class Kind(IntEnum):
    OPEN = 1  # a new stream (payload empty)
    DATA = 2  # bytes of a stream
    CLOSE = 3  # the sender sends no more data on this stream
    RESET = 4  # abort the stream in both directions (payload: optional UTF-8 reason)
    WINDOW = 5  # credit: the receiver consumed this many bytes (payload: uint32)


class ProtocolError(ValueError):
    """The peer sent something that is not a valid frame."""


@dataclass(frozen=True)
class Frame:
    kind: Kind
    stream: int
    payload: bytes = b""


def encode(frame: Frame) -> bytes:
    return HEADER.pack(frame.kind, frame.stream) + frame.payload


def decode(data: bytes) -> Frame:
    if len(data) < HEADER.size:
        raise ProtocolError("frame too short")
    kind, stream = HEADER.unpack_from(data)
    try:
        frame = Frame(Kind(kind), stream, bytes(data[HEADER.size :]))
    except ValueError as exc:
        raise ProtocolError(f"unknown frame type {kind}") from exc
    if frame.kind == Kind.DATA and len(frame.payload) > MAX_DATA:
        raise ProtocolError("data frame too large")
    if frame.kind == Kind.WINDOW and len(frame.payload) != CREDIT.size:
        raise ProtocolError("bad window frame")
    return frame


def window(stream: int, credit: int) -> Frame:
    return Frame(Kind.WINDOW, stream, CREDIT.pack(credit))


def credit_of(frame: Frame) -> int:
    value: int = CREDIT.unpack(frame.payload)[0]
    return value
