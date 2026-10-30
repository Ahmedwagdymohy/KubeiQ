"""Usage history (ADR 0015): measured samples only, downsampled, read through the API."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from kubeiq.db.models import UsageSample
from kubeiq.db.session import get_sessionmaker
from kubeiq.products.manager import resources
from kubeiq.usage import history
from kubeiq.usage.summary import ClusterSummary, Gauge


def _summary(cpu: float) -> ClusterSummary:
    return ClusterSummary(
        health="healthy",
        nodes=2,
        nodes_ready=2,
        pods=10,
        pods_running=9,
        cpu=Gauge(used=cpu, capacity=4),
        memory=Gauge(used=2**30, capacity=2**32),
    )


async def _rows() -> list[UsageSample]:
    async with get_sessionmaker()() as session:
        return list((await session.execute(select(UsageSample))).scalars())


def test_samples_become_points(client: TestClient) -> None:
    async def run() -> list[history.UsagePoint]:
        async with get_sessionmaker()() as session:
            await history.record(session, "c1", _summary(1))
            await history.record(session, "c1", ClusterSummary(health="offline"))  # not measured
            await history.record(session, "c2", _summary(3))
            return await history.points(session, "c1", 24)

    points = asyncio.run(run())
    assert len(points) == 1
    assert points[0].cpu == 25.0 and points[0].memory == 25.0 and points[0].pods_running == 9

    body = client.get("/api/v1/clusters/c1/usage", params={"hours": 6}).json()
    assert [p["cpu"] for p in body] == [25.0]
    assert client.get("/api/v1/clusters/c1/usage", params={"hours": 999}).status_code == 422


def test_old_samples_are_averaged_then_dropped(client: TestClient) -> None:
    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)

    async def run() -> None:
        async with get_sessionmaker()() as session:
            base = now - timedelta(days=2)
            for minute, cpu in enumerate([1.0, 2.0, 3.0]):
                session.add(
                    UsageSample(
                        cluster_id="c1",
                        at=base + timedelta(minutes=minute),
                        cpu_used=cpu,
                        cpu_capacity=4,
                        pods_running=9,
                        nodes=2,
                    )
                )
            session.add(UsageSample(cluster_id="c1", at=now - timedelta(days=8), cpu_used=1))
            session.add(UsageSample(cluster_id="c1", at=now - timedelta(hours=1), cpu_used=1))
            await session.commit()
            await history.downsample(session, now)

    asyncio.run(run())
    rows = sorted(asyncio.run(_rows()), key=lambda r: r.at)
    assert [r.seconds for r in rows] == [600, 60]  # 8-day-old gone; recent raw kept
    assert rows[0].cpu_used == 2.0 and rows[0].pods_running == 9


def test_feed_lists_newest_events_first(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, Any]] = []

    def fake_request(_: Any, method: str, path: str, query: Any = None, **__: Any) -> Any:
        seen.append((path, query))
        return {
            "items": [
                {
                    "type": "Warning",
                    "reason": "BackOff",
                    "message": "Back-off restarting",
                    "count": 4,
                    "lastTimestamp": "2026-10-30T10:00:00Z",
                    "involvedObject": {"kind": "Pod", "name": "web-1", "namespace": "shop"},
                    "source": {"component": "kubelet"},
                },
                {
                    "type": "Warning",
                    "reason": "Failed",
                    "lastTimestamp": "2026-10-30T11:00:00Z",
                    "involvedObject": {"kind": "Pod", "name": "web-2", "namespace": "shop"},
                },
            ]
        }

    monkeypatch.setattr(resources, "request", fake_request)
    events = resources.recent_events(None, ["shop"], True, 10)  # type: ignore[arg-type]
    assert [e.name for e in events] == ["web-2", "web-1"]
    assert events[1].source == "kubelet" and events[1].kind == "Pod"
    assert seen[0][0] == "/api/v1/namespaces/shop/events"
    assert ("fieldSelector", "type=Warning") in seen[0][1]
