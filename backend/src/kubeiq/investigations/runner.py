"""Runs investigations in the background and records their progress.

In-process asyncio tasks bounded by a semaphore. The scaling path is a Redis-backed queue with
worker pods; the API contract (create -> stream events -> fetch result) stays the same.
"""

import asyncio
import itertools
from functools import lru_cache

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.agent.llm import get_llm
from kubeiq.agent.service import diagnose
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.collectors.models import ProgressEvent, Scope
from kubeiq.core.config import Settings, get_settings
from kubeiq.db.models import Investigation
from kubeiq.db.session import get_sessionmaker
from kubeiq.investigations import repository
from kubeiq.investigations.broker import EventBroker
from kubeiq.investigations.models import EventOut


class InvestigationRunner:
    def __init__(self, settings: Settings, registry: ClusterRegistry, broker: EventBroker) -> None:
        self.settings = settings
        self.registry = registry
        self.broker = broker
        self._slots = asyncio.Semaphore(settings.max_concurrent_investigations)
        self._tasks: set[asyncio.Task[None]] = set()
        self._sequences: dict[str, itertools.count[int]] = {}

    def start(self, investigation: Investigation) -> None:
        task = asyncio.create_task(
            self._run(investigation.id), name=f"investigation-{investigation.id}"
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def shutdown(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _record(self, investigation_id: str, event: ProgressEvent) -> None:
        # Assigned before any await, so concurrent events get unique, ordered numbers.
        seq = next(self._sequences.setdefault(investigation_id, itertools.count(1)))
        async with get_sessionmaker()() as session:
            stored = await repository.add_event(
                session, investigation_id, seq, event.step, event.status, event.detail
            )
        self.broker.publish(investigation_id, EventOut.model_validate(stored))

    async def _run(self, investigation_id: str) -> None:
        async def progress(event: ProgressEvent) -> None:
            await self._record(investigation_id, event)

        async with self._slots, get_sessionmaker()() as session:
            investigation = await repository.get(session, investigation_id)
            if investigation is None:
                return
            llm = get_llm(self.settings)
            await repository.mark_running(session, investigation, llm.model if llm else None)
            try:
                api = self.registry.api_client(investigation.cluster_id)
                scope = Scope(
                    cluster_id=investigation.cluster_id, namespace=investigation.namespace
                )
                report = await diagnose(api, scope, self.settings, llm, progress)
            except asyncio.CancelledError:
                await repository.mark_failed(session, investigation, "Cancelled during shutdown")
                raise
            except ClusterNotFoundError as exc:
                await self._fail(session, investigation, str(exc))
            except Exception as exc:
                logger.exception("Investigation {} failed", investigation_id)
                await self._fail(session, investigation, describe_error(exc))
            else:
                detail = (
                    "No problems found. The cluster looks healthy"
                    if report.healthy
                    else f"{len(report.diagnoses)} incident(s) diagnosed"
                )
                # Final event first, then status: anyone who sees a finished status
                # is guaranteed to find the complete timeline.
                await progress(ProgressEvent(step="done", status="completed", detail=detail))
                await repository.mark_completed(session, investigation, report)
            finally:
                self.broker.close(investigation_id)
                self._sequences.pop(investigation_id, None)

    async def _fail(self, session: AsyncSession, investigation: Investigation, error: str) -> None:
        await self._record(
            investigation.id, ProgressEvent(step="done", status="failed", detail=error)
        )
        await repository.mark_failed(session, investigation, error)


@lru_cache
def get_broker() -> EventBroker:
    return EventBroker()


@lru_cache
def get_runner() -> InvestigationRunner:
    return InvestigationRunner(get_settings(), get_registry(), get_broker())
