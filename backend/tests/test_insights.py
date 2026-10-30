"""Insights: balance score, timeline merging and KubeiQ's own entries."""

import asyncio
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from kubeiq.auth import repository
from kubeiq.db.session import get_sessionmaker
from kubeiq.products.insights import distribution, timeline


def test_balance_score() -> None:
    assert distribution.balance([10, 10, 10]) == 100
    assert distribution.balance([12, 10, 8]) >= 80
    assert distribution.balance([30, 2, 1]) < 50
    assert distribution.balance([5]) == 100 and distribution.balance([0, 0]) == 100
    assert distribution.verdict(85) == "Well balanced"
    assert distribution.verdict(60) == "Moderate"
    assert distribution.verdict(20) == "Imbalanced"


def test_feeds_merge_newest_first() -> None:
    now = datetime.now(UTC)
    a = timeline.TimelineItem(
        id="a",
        source="kubernetes",
        type="Warning",
        reason="BackOff",
        message="",
        last_seen=now - timedelta(minutes=5),
    )
    b = timeline.TimelineItem(
        id="b", source="kubeiq", type="Normal", reason="Scaled", message="", last_seen=now
    )
    c = timeline.TimelineItem(
        id="c", source="kubernetes", type="Normal", reason="Pulled", message=""
    )
    assert [i.id for i in timeline.merge([a, c], [b], limit=10)] == ["b", "a", "c"]
    assert len(timeline.merge([a, c], [b], limit=2)) == 2


def test_kubeiq_entries_come_from_changes(client: TestClient) -> None:
    async def run() -> list[timeline.TimelineItem]:
        async with get_sessionmaker()() as session:
            await repository.record(
                session,
                "admin",
                "k8s.scale",
                target="deployments/web",
                cluster_id="c1",
                namespace="shop",
                detail="to 3 replicas",
            )
            await repository.record(
                session, "admin", "k8s.delete", target="pods/x", cluster_id="c1", namespace="other"
            )
            await repository.record(session, "admin", "auth.login")
            return await timeline.kubeiq_entries(session, "c1", ["shop"])

    items = asyncio.run(run())
    assert [i.reason for i in items] == ["Scaled"]
    assert items[0].kind == "deployments" and items[0].name == "web"
    assert "to 3 replicas" in items[0].message
