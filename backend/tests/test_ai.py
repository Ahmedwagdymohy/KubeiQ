"""AI: log analysis (bounded, redacted, validated) and the cluster assistant (scoped tools,
saved conversations)."""

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from kubeiq.agent import log_analysis
from kubeiq.agent.llm import LLMReply, ToolCall
from kubeiq.agent.scoped import ScopedTools
from kubeiq.api.v1 import ai as ai_api
from kubeiq.core.config import Settings
from tests.test_agent import FakeLLM, FakeTools


def test_log_excerpt_keeps_errors_and_tail_redacted() -> None:
    lines = [f"ok {i}" for i in range(1000)]
    lines[100] = "ERROR connecting with password=hunter2"
    excerpt = log_analysis.select(lines)
    assert len(excerpt) <= log_analysis.MAX_LINES
    assert excerpt[-1] == "ok 999"
    joined = "\n".join(excerpt)
    assert "ERROR connecting" in joined and "hunter2" not in joined
    assert log_analysis.GAP in excerpt  # skipped stretches are marked
    assert excerpt.index("ok 99") < excerpt.index(next(e for e in excerpt if "ERROR" in e))


def test_analysis_reply_is_validated() -> None:
    reply = json.dumps(
        {
            "summary": "The app cannot reach its database",
            "status": "failing",
            "errors": [
                {"line": 3, "meaning": "DB refused", "severity": "critical"},
                {"line": 99, "meaning": "x"},
            ],
            "root_cause": "db is down",
            "commands": ["kubectl -n shop get pods"],
        }
    )
    analysis = log_analysis.parse(f"```json\n{reply}\n```", line_count=10)
    assert analysis.status == "failing" and [e.line for e in analysis.errors] == [3]
    with pytest.raises(ValueError):
        log_analysis.parse("no json here", 10)


async def test_tools_stay_inside_allowed_namespaces() -> None:
    inner = FakeTools()
    tools = ScopedTools(inner, {"shop"})  # type: ignore[arg-type]
    assert "may not read" in await tools.run(
        "get_pod_logs", {"namespace": "kube-system", "pod": "x"}
    )
    assert "cluster-wide" in await tools.run("describe_node", {"name": "n1"})
    assert "may not read" in await tools.run("find_problem_pods", {"namespace": "other"})
    await tools.run("get_pod_logs", {"namespace": "shop", "pod": "web"})
    assert inner.calls == [("get_pod_logs", {"namespace": "shop", "pod": "web"})]
    assert tools.list_namespaces() == ["shop"]


def _with_model(monkeypatch: pytest.MonkeyPatch, llm: FakeLLM) -> FakeTools:
    async def settings_with_model(session: Any, base: Settings) -> Settings:
        return base.model_copy(update={"llm_model": "fake/model"})

    inner = FakeTools()
    monkeypatch.setattr(ai_api, "effective_settings", settings_with_model)
    monkeypatch.setattr(ai_api, "get_llm", lambda settings: llm)
    monkeypatch.setattr(
        ai_api, "_tools", lambda registry, cluster, namespaces: ScopedTools(inner, namespaces)
    )  # type: ignore[arg-type]
    return inner


def _events(client: TestClient, path: str, body: dict[str, Any]) -> list[tuple[str, Any]]:
    events = []
    with client.stream("POST", path, json=body) as response:
        assert response.status_code == 200
        name = None
        for line in response.iter_lines():
            if line.startswith("event:"):
                name = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and name:
                events.append((name, json.loads(line.split(":", 1)[1])))
    return events


def test_assistant_conversation_is_saved_per_user(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert client.get("/api/v1/ai/status").json() == {"enabled": True}  # the env model in tests
    llm = FakeLLM(
        [
            LLMReply(None, [ToolCall("1", "get_pod_logs", {"namespace": "shop", "pod": "web-1"})]),
            LLMReply("web-1 crashes: replicas must be > 0.\n```\nkubectl -n shop get pods\n```"),
        ]
    )
    tools = _with_model(monkeypatch, llm)
    convo = client.post("/api/v1/ai/conversations", json={"cluster_id": "kubeconfig:any"}).json()
    events = _events(
        client,
        f"/api/v1/ai/conversations/{convo['id']}/ask",
        {"message": "Why is web failing? token=abc123"},
    )
    assert events[0] == ("step", {"detail": "Reading logs of pod web-1"})
    name, messages = events[-1]
    assert name == "messages" and messages[1]["steps"] == ["Reading logs of pod web-1"]
    assert "abc123" not in messages[0]["content"]  # questions are redacted before the model
    assert tools.calls[0][0] == "get_pod_logs"

    listed = client.get("/api/v1/ai/conversations", params={"cluster_id": "kubeconfig:any"}).json()
    assert listed[0]["title"].startswith("Why is web failing?")
    detail = client.get(f"/api/v1/ai/conversations/{convo['id']}").json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert (
        client.patch(f"/api/v1/ai/conversations/{convo['id']}", json={"title": "Web"}).json()[
            "title"
        ]
        == "Web"
    )

    # Someone else cannot read it.
    client.post("/api/v1/users", json={"username": "viewer", "password": "viewer-pass"})
    other = TestClient(client.app)
    other.post("/api/v1/auth/login", json={"username": "viewer", "password": "viewer-pass"})
    assert other.get(f"/api/v1/ai/conversations/{convo['id']}").status_code == 404
    assert (
        other.post("/api/v1/ai/conversations", json={"cluster_id": "kubeconfig:any"}).status_code
        == 403
    )

    assert client.delete(f"/api/v1/ai/conversations/{convo['id']}").status_code == 204
    assert client.get("/api/v1/ai/conversations").json() == []


def test_log_follow_up_streams_an_answer(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _with_model(monkeypatch, FakeLLM([LLMReply("Restart it after fixing the env var.")]))
    events = _events(
        client,
        "/api/v1/ai/logs/ask",
        {
            "cluster_id": "kubeconfig:any",
            "namespace": "shop",
            "pod": "web-1",
            "analysis": {"summary": "crash"},
            "message": "What now?",
        },
    )
    assert events[-1] == (
        "messages",
        {"answer": "Restart it after fixing the env var.", "steps": []},
    )
