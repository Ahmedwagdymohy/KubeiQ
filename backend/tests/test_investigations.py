import asyncio
import json
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from kubeiq.agent.diagnosis import Diagnosis, DiagnosisReport
from kubeiq.clusters import registry as registry_module
from kubeiq.collectors.models import ProgressEvent
from kubeiq.core import config
from kubeiq.db import session as db_session
from kubeiq.db.models import Investigation, InvestigationStatus
from kubeiq.detectors.models import Severity
from kubeiq.investigations import repository, runner
from kubeiq.investigations.broker import EventBroker
from kubeiq.investigations.models import EventOut
from kubeiq.main import create_app
from tests.conftest import AUTH
from tests.test_clusters_api import FakeRegistry, FakeSource

REPORT = DiagnosisReport(
    cluster_id="kubeconfig:up",
    namespace="shop",
    healthy=False,
    diagnoses=[
        Diagnosis(
            incident_id="Deployment/shop/payment",
            title="payment: CrashLoopBackOff",
            workload="Deployment/shop/payment",
            severity=Severity.CRITICAL,
            root_cause="DATABASE_URL is not set",
            explanation="...",
            confidence=92,
            source="rules",
        )
    ],
    duration_seconds=0.1,
)


def _clear_caches() -> None:
    for fn in (
        config.get_settings,
        db_session.get_engine,
        db_session.get_sessionmaker,
        registry_module.get_registry,
        runner.get_broker,
        runner.get_runner,
    ):
        fn.cache_clear()


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("KUBEIQ_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("KUBEIQ_LLM_MODEL", "")
    _clear_caches()

    fake_registry = FakeRegistry([FakeSource()])
    fake_registry.api_client = lambda cluster_id: object()  # type: ignore[method-assign]
    broker = EventBroker()
    test_runner = runner.InvestigationRunner(config.get_settings(), fake_registry, broker)

    app = create_app()
    app.dependency_overrides[registry_module.get_registry] = lambda: fake_registry
    app.dependency_overrides[runner.get_runner] = lambda: test_runner
    app.dependency_overrides[runner.get_broker] = lambda: broker
    with TestClient(app, headers=AUTH) as test_client:
        yield test_client
    _clear_caches()


def fake_diagnose(fail: bool = False) -> Any:
    async def run(
        api: Any, scope: Any, settings: Any, llm: Any, on_progress: Any
    ) -> DiagnosisReport:
        await on_progress(ProgressEvent(step="pods", status="started"))
        await asyncio.sleep(0.05)
        await on_progress(ProgressEvent(step="pods", status="completed", detail="3 checked"))
        if fail:
            raise ConnectionRefusedError("boom")
        return REPORT

    return run


def wait_finished(client: TestClient, investigation_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        body: dict[str, Any] = client.get(f"/api/v1/investigations/{investigation_id}").json()
        if body["status"] in {"completed", "failed"}:
            return body
        time.sleep(0.05)
    raise AssertionError("investigation did not finish")


def sse_events(client: TestClient, investigation_id: str) -> list[tuple[str, dict[str, Any]]]:
    events = []
    with client.stream("GET", f"/api/v1/investigations/{investigation_id}/events") as response:
        name = None
        for line in response.iter_lines():
            if line.startswith("event:"):
                name = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and name:
                events.append((name, json.loads(line.split(":", 1)[1])))
    return events


def test_investigation_runs_in_background_and_stores_report(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runner, "diagnose", fake_diagnose())

    response = client.post(
        "/api/v1/investigations", json={"cluster_id": "kubeconfig:up", "namespace": "shop"}
    )
    assert response.status_code == 202
    investigation_id = response.json()["id"]
    assert response.json()["status"] == "queued"

    body = wait_finished(client, investigation_id)
    assert body["status"] == "completed"
    assert body["incident_count"] == 1
    assert body["summary"] == "payment: DATABASE_URL is not set"
    assert body["report"]["diagnoses"][0]["confidence"] == 92
    assert [e["step"] for e in body["events"]] == ["pods", "pods", "done"]
    assert [e["seq"] for e in body["events"]] == [1, 2, 3]

    history = client.get("/api/v1/investigations").json()
    assert [h["id"] for h in history] == [investigation_id]


def test_events_stream_replays_and_ends(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runner, "diagnose", fake_diagnose())
    investigation_id = client.post(
        "/api/v1/investigations", json={"cluster_id": "kubeconfig:up"}
    ).json()["id"]
    wait_finished(client, investigation_id)

    events = sse_events(client, investigation_id)
    assert [name for name, _ in events] == ["progress", "progress", "progress", "end"]
    assert events[-2][1]["detail"] == "1 issue diagnosed"
    assert events[-1][1] == {"status": "completed"}


def test_failed_investigation_records_friendly_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runner, "diagnose", fake_diagnose(fail=True))
    investigation_id = client.post(
        "/api/v1/investigations", json={"cluster_id": "kubeconfig:up"}
    ).json()["id"]

    body = wait_finished(client, investigation_id)
    assert body["status"] == "failed"
    assert body["error"].startswith("Cluster unreachable")
    assert body["events"][-1]["step"] == "done"


def test_history_pages_with_before_cursor(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runner, "diagnose", fake_diagnose())
    ids = []
    for _ in range(3):
        investigation_id = client.post(
            "/api/v1/investigations", json={"cluster_id": "kubeconfig:up"}
        ).json()["id"]
        wait_finished(client, investigation_id)
        ids.append(investigation_id)

    first = client.get("/api/v1/investigations", params={"limit": 2}).json()
    assert [h["id"] for h in first] == [ids[2], ids[1]]

    rest = client.get(
        "/api/v1/investigations", params={"limit": 2, "before": first[-1]["created_at"]}
    ).json()
    assert [h["id"] for h in rest] == [ids[0]]


def test_unknown_cluster_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/investigations", json={"cluster_id": "kubeconfig:nope"})
    assert response.status_code == 404


def test_unknown_investigation_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/investigations/missing").status_code == 404
    assert client.get("/api/v1/investigations/missing/events").status_code == 404


async def test_interrupted_runs_are_marked_failed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from kubeiq.db.migrate import upgrade_database

    monkeypatch.setenv("KUBEIQ_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'restart.db'}")
    _clear_caches()
    await upgrade_database()
    async with db_session.get_sessionmaker()() as session:
        stuck = Investigation(cluster_id="c", status=InvestigationStatus.RUNNING)
        session.add(stuck)
        await session.commit()
        assert await repository.fail_interrupted(session) == 1
        await session.refresh(stuck)
        assert stuck.status == InvestigationStatus.FAILED
        assert stuck.error == "Interrupted by a server restart"
    await db_session.get_engine().dispose()
    _clear_caches()


async def test_broker_delivers_until_closed() -> None:
    broker = EventBroker()
    event = EventOut(seq=1, step="pods", status="started", created_at=datetime.now(UTC))
    async with broker.subscribe("inv") as queue:
        broker.publish("inv", event)
        broker.close("inv")
        assert await queue.get() == event
        assert await queue.get() is None


async def test_stream_keeps_out_of_order_live_events(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Parallel agents may publish seq 4 before seq 2; neither may be dropped."""
    from kubeiq.api.v1.investigations import _events
    from kubeiq.db.migrate import upgrade_database

    monkeypatch.setenv("KUBEIQ_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'order.db'}")
    _clear_caches()
    await upgrade_database()
    async with db_session.get_sessionmaker()() as session:
        investigation = await repository.create(session, "c", None)
        await repository.mark_running(session, investigation, None)

    class Connected:
        async def is_disconnected(self) -> bool:
            return False

    broker = EventBroker()
    stream = _events(investigation.id, Connected(), broker)  # type: ignore[arg-type]
    received: list[int] = []

    async def consume() -> None:
        async for message in stream:
            if message["event"] == "progress":
                received.append(json.loads(message["data"])["seq"])

    task = asyncio.create_task(consume())
    await asyncio.sleep(0.1)
    now = datetime.now(UTC)
    for seq in (1, 4, 2, 3):
        broker.publish(
            investigation.id, EventOut(seq=seq, step="agent", status="started", created_at=now)
        )
    broker.close(investigation.id)
    await asyncio.wait_for(task, timeout=5)

    assert sorted(received) == [1, 2, 3, 4]
    await db_session.get_engine().dispose()
    _clear_caches()


def test_naive_datetimes_are_returned_as_utc() -> None:
    naive = datetime(2026, 10, 22, 9, 0)
    assert EventOut(seq=1, step="x", status="y", created_at=naive).created_at.tzinfo is UTC
