"""Usage history (ADR 0015): a sample per cluster per minute, so trend lines show measured data.

Raw samples are kept for a day, then averaged into 10-minute samples kept for 7 days. Only
clusters in a project are sampled, and only when their metrics are on.
"""

import asyncio
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from loguru import logger
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import membership
from kubeiq.auth import repository as auth_repository
from kubeiq.clusters import meta
from kubeiq.clusters.registry import ClusterRegistry
from kubeiq.db.models import DEFAULT_ORG, UsageSample
from kubeiq.db.session import get_sessionmaker
from kubeiq.usage.summary import ClusterSummary, summarize

RAW_SECONDS = 60
BUCKET_SECONDS = 600
RAW_KEEP = timedelta(days=1)
KEEP = timedelta(days=7)
SAMPLE_TIMEOUT = 20.0


class UsagePoint(BaseModel):
    at: datetime
    cpu: float | None  # percent of allocatable
    memory: float | None
    pods_running: int | None


def _percent(used: float | None, capacity: float | None) -> float | None:
    return round(100 * used / capacity, 1) if used is not None and capacity else None


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


async def record(session: AsyncSession, cluster_id: str, summary: ClusterSummary) -> None:
    if summary.nodes is None:
        return  # offline or unreadable: nothing was measured
    session.add(
        UsageSample(
            cluster_id=cluster_id,
            seconds=RAW_SECONDS,
            cpu_used=summary.cpu.used if summary.cpu else None,
            cpu_capacity=summary.cpu.capacity if summary.cpu else None,
            memory_used=summary.memory.used if summary.memory else None,
            memory_capacity=summary.memory.capacity if summary.memory else None,
            pods_running=summary.pods_running,
            pods=summary.pods,
            nodes_ready=summary.nodes_ready,
            nodes=summary.nodes,
        )
    )
    await session.commit()


def _mean(values: list[float | int | None]) -> float | None:
    present = [float(v) for v in values if v is not None]
    return sum(present) / len(present) if present else None


async def downsample(session: AsyncSession, now: datetime | None = None) -> None:
    """Average raw samples older than a day into 10-minute samples; drop anything past 7 days."""
    now = now or datetime.now(UTC)
    await session.execute(delete(UsageSample).where(UsageSample.at < now - KEEP))
    old = (
        await session.execute(
            select(UsageSample).where(
                UsageSample.seconds == RAW_SECONDS, UsageSample.at < now - RAW_KEEP
            )
        )
    ).scalars()
    buckets: dict[tuple[str, int], list[UsageSample]] = defaultdict(list)
    for row in old:
        stamp = int(_utc(row.at).timestamp()) // BUCKET_SECONDS * BUCKET_SECONDS
        buckets[(row.cluster_id, stamp)].append(row)
    for (cluster_id, stamp), rows in buckets.items():
        nodes = _mean([r.nodes for r in rows])
        session.add(
            UsageSample(
                cluster_id=cluster_id,
                at=datetime.fromtimestamp(stamp, UTC),
                seconds=BUCKET_SECONDS,
                cpu_used=_mean([r.cpu_used for r in rows]),
                cpu_capacity=_mean([r.cpu_capacity for r in rows]),
                memory_used=_mean([r.memory_used for r in rows]),
                memory_capacity=_mean([r.memory_capacity for r in rows]),
                pods_running=round(v) if (v := _mean([r.pods_running for r in rows])) else None,
                pods=round(v) if (v := _mean([r.pods for r in rows])) else None,
                nodes_ready=round(v) if (v := _mean([r.nodes_ready for r in rows])) else None,
                nodes=round(nodes) if nodes else None,
            )
        )
        for row in rows:
            await session.delete(row)
    await session.commit()


async def points(session: AsyncSession, cluster_id: str, hours: int) -> list[UsagePoint]:
    since = datetime.now(UTC) - timedelta(hours=hours)
    rows = (
        await session.execute(
            select(UsageSample)
            .where(
                UsageSample.org_id == DEFAULT_ORG,
                UsageSample.cluster_id == cluster_id,
                UsageSample.at >= since,
            )
            .order_by(UsageSample.at)
        )
    ).scalars()
    return [
        UsagePoint(
            at=_utc(r.at),
            cpu=_percent(r.cpu_used, r.cpu_capacity),
            memory=_percent(r.memory_used, r.memory_capacity),
            pods_running=r.pods_running,
        )
        for r in rows
    ]


async def sample_once(registry: ClusterRegistry) -> int:
    """Sample every cluster in a project whose metrics are on. Returns how many were recorded."""
    async with get_sessionmaker()() as session:
        wanted = await auth_repository.project_clusters(session)
        hidden = await membership.hidden(session)
        settings = await meta.all_rows(session)
    ids = [
        c.id
        for c in registry.list_clusters()
        if c.id in wanted and c.id not in hidden and not c.login
        if settings.get(c.id) is None or settings[c.id].metrics
    ]

    async def one(cluster_id: str) -> tuple[str, ClusterSummary | None]:
        try:
            status = await registry.check(cluster_id)
            api = registry.api_client(cluster_id)
            summary = await asyncio.wait_for(
                asyncio.to_thread(summarize, api, status, False), SAMPLE_TIMEOUT
            )
        except Exception as exc:
            logger.debug("Usage sample failed for {}: {}", cluster_id, exc)
            return cluster_id, None
        return cluster_id, summary

    results = await asyncio.gather(*(one(cid) for cid in ids))
    recorded = 0
    async with get_sessionmaker()() as session:
        for cluster_id, summary in results:
            if summary is not None and summary.nodes is not None:
                await record(session, cluster_id, summary)
                recorded += 1
    return recorded


async def sample_forever(registry: ClusterRegistry, interval: float) -> None:
    last_downsample = datetime.now(UTC)
    while True:
        try:
            await sample_once(registry)
            if datetime.now(UTC) - last_downsample > timedelta(hours=1):
                async with get_sessionmaker()() as session:
                    await downsample(session)
                last_downsample = datetime.now(UTC)
        except Exception:
            logger.exception("Usage sampling failed")
        await asyncio.sleep(interval)
