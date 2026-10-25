import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from kubeiq.agent import chat
from kubeiq.agent.llm import LLMError, LLMReply, ToolCall
from kubeiq.api.v1 import investigations as investigations_api
from kubeiq.core.config import Settings
from kubeiq.investigations import runner
from tests.test_agent import FakeLLM, FakeTools
from tests.test_investigations import REPORT, client, fake_diagnose, wait_finished

__all__ = ["client"]  # the fixture, shared with the investigation tests

INCIDENT = REPORT.diagnoses[0].incident_id


@pytest.fixture
def finished(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(runner, "diagnose", fake_diagnose())
    investigation_id: str = client.post(
        "/api/v1/investigations", json={"cluster_id": "kubeconfig:up", "namespace": "shop"}
    ).json()["id"]
    wait_finished(client, investigation_id)
    return investigation_id


def with_llm(monkeypatch: pytest.MonkeyPatch, llm: FakeLLM) -> FakeTools:
    async def settings_with_model(session: Any, base: Settings) -> Settings:
        return base.model_copy(update={"llm_model": "fake/model"})

    tools = FakeTools()
    monkeypatch.setattr(investigations_api, "effective_settings", settings_with_model)
    monkeypatch.setattr(investigations_api, "get_llm", lambda settings: llm)
    monkeypatch.setattr(investigations_api, "AgentTools", lambda api: tools)
    return tools


def ask(client: TestClient, investigation_id: str, message: str) -> list[tuple[str, Any]]:
    events = []
    with client.stream(
        "POST",
        f"/api/v1/investigations/{investigation_id}/chat",
        json={"incident_id": INCIDENT, "message": message},
    ) as response:
        assert response.status_code == 200
        name = None
        for line in response.iter_lines():
            if line.startswith("event:"):
                name = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and name:
                events.append((name, json.loads(line.split(":", 1)[1])))
    return events


def thread(client: TestClient, investigation_id: str) -> dict[str, Any]:
    response = client.get(
        f"/api/v1/investigations/{investigation_id}/chat", params={"incident_id": INCIDENT}
    )
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def test_chat_needs_an_ai_model(client: TestClient, finished: str) -> None:
    assert thread(client, finished) == {"ai_enabled": False, "messages": []}
    response = client.post(
        f"/api/v1/investigations/{finished}/chat",
        json={"incident_id": INCIDENT, "message": "Why?"},
    )
    assert response.status_code == 409


def test_question_checks_the_cluster_then_answers_and_is_stored(
    client: TestClient, finished: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    llm = FakeLLM(
        [
            LLMReply(
                content=None,
                tool_calls=[
                    ToolCall("1", "get_pod_logs", {"namespace": "shop", "pod": "payment-1"})
                ],
            ),
            LLMReply(content="It started after the 10:02 rollout."),
            LLMReply(content="Yes, roll back with the command below."),
        ]
    )
    tools = with_llm(monkeypatch, llm)

    events = ask(client, finished, "Why now? password=hunter2")
    assert events[0] == ("step", {"detail": "Reading logs of pod payment-1"})
    name, messages = events[-1]
    assert name == "messages"
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "Why now? password=[REDACTED]"
    assert messages[0]["author"] == "admin"
    assert messages[1]["content"] == "It started after the 10:02 rollout."
    assert tools.calls == [("get_pod_logs", {"namespace": "shop", "pod": "payment-1"})]
    # The diagnosis is the context; nothing secret reaches the model.
    assert "DATABASE_URL is not set" in llm.calls[0][1]["content"]
    assert "hunter2" not in json.dumps(llm.calls)

    ask(client, finished, "Can I roll back?")
    second_call = llm.calls[-1]
    assert [m["content"] for m in second_call[-3:]] == [
        "Why now? password=[REDACTED]",
        "It started after the 10:02 rollout.",
        "Can I roll back?",
    ]

    body = thread(client, finished)
    assert body["ai_enabled"] is True
    assert len(body["messages"]) == 4


def test_failed_answer_is_reported_and_not_stored(
    client: TestClient, finished: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    with_llm(monkeypatch, FakeLLM([LLMError("LLM rate limit reached. Try again shortly")]))
    events = ask(client, finished, "Why?")
    assert events == [("error", {"detail": "LLM rate limit reached. Try again shortly"})]
    assert thread(client, finished)["messages"] == []


def test_unknown_incident_or_investigation_is_404(client: TestClient, finished: str) -> None:
    missing = client.get(
        f"/api/v1/investigations/{finished}/chat", params={"incident_id": "Deployment/x/y"}
    )
    assert missing.status_code == 404
    assert (
        client.get("/api/v1/investigations/nope/chat", params={"incident_id": INCIDENT}).status_code
        == 404
    )


def test_empty_or_long_questions_are_rejected(client: TestClient, finished: str) -> None:
    for message in ("", "x" * 2001):
        response = client.post(
            f"/api/v1/investigations/{finished}/chat",
            json={"incident_id": INCIDENT, "message": message},
        )
        assert response.status_code == 422


async def test_answer_without_cluster_access_skips_tools() -> None:
    llm = FakeLLM([LLMReply(content="  From the diagnosis: set DATABASE_URL.  ")])
    reply = await chat.answer(REPORT.diagnoses[0], "kubeconfig:up", [], "Fix?", llm, None, 3)
    assert reply == "From the diagnosis: set DATABASE_URL."


async def test_answer_wraps_up_at_the_step_limit() -> None:
    loop = LLMReply(content=None, tool_calls=[ToolCall("1", "get_events", {"namespace": "shop"})])
    llm = FakeLLM([loop, loop, LLMReply(content="Here is what I found.")])
    steps: list[str] = []

    async def on_step(detail: str) -> None:
        steps.append(detail)

    reply = await chat.answer(
        REPORT.diagnoses[0], "kubeconfig:up", [], "Why?", llm, FakeTools(), 2, on_step
    )
    assert reply == "Here is what I found."
    assert steps == ["Checking events", "Checking events"]
    assert llm.calls[-1][-1]["content"] == chat.WRAP_UP_PROMPT
