"""In-process pub/sub for live investigation progress.

Single-replica only. When KubeiQ runs with several API replicas this is replaced by a
Redis-backed broker with the same interface (see docs/architecture.md, scaling path).
"""

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from kubeiq.investigations.models import EventOut


class EventBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[EventOut | None]]] = defaultdict(set)

    def publish(self, investigation_id: str, event: EventOut) -> None:
        for queue in self._subscribers.get(investigation_id, ()):
            queue.put_nowait(event)

    def close(self, investigation_id: str) -> None:
        """Signal subscribers that no more events will follow."""
        for queue in self._subscribers.pop(investigation_id, set()):
            queue.put_nowait(None)

    @asynccontextmanager
    async def subscribe(
        self, investigation_id: str
    ) -> AsyncIterator[asyncio.Queue[EventOut | None]]:
        queue: asyncio.Queue[EventOut | None] = asyncio.Queue()
        self._subscribers[investigation_id].add(queue)
        try:
            yield queue
        finally:
            subscribers = self._subscribers.get(investigation_id)
            if subscribers is not None:
                subscribers.discard(queue)
                if not subscribers:
                    self._subscribers.pop(investigation_id, None)
