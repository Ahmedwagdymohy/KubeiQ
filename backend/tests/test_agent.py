import json
from datetime import UTC, datetime
from typing import Any

import pytest

from kubeiq.agent import service
from kubeiq.agent.agent import AgentFailedError, investigate, parse_answer
from kubeiq.agent.diagnosis import AgentAnswer, score_confidence
from kubeiq.agent.llm import LLMError, LLMReply, ToolCall
from kubeiq.collectors.models import (
    ContainerSnapshot,
    EvidenceBundle,
    Gap,
    LogExcerpt,
    PodSnapshot,
    Scope,
)
from kubeiq.core.config import Settings
from kubeiq.detectors.correlate import correlate
from kubeiq.detectors.models import Incident
from kubeiq.detectors.registry import run_detectors

NOW = datetime(2026, 10, 22, 12, 0, tzinfo=UTC)

ANSWER = {
    "root_cause": "Config validation fails: replicas must be greater than 0",
    "explanation": "The app panics during startup while validating config.yaml.",
    "fix_steps": ["Set replicas >= 1 in the app ConfigMap"],
    "commands": ["kubectl edit configmap worker-config -n shop"],
    "prevention": "Validate config in CI",
    "confidence": 80,
    "evidence": ["previous logs line 3"],
    "agrees_with_rules": None,
}


class FakeLLM:
    model = "fake/model"

    def __init__(self, replies: list[LLMReply | Exception]) -> None:
        self.replies = replies
        self.calls: list[list[dict[str, Any]]] = []

    async def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
    ) -> LLMReply:
        self.calls.append(list(messages))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class FakeTools:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def run(self, name: str, arguments: dict[str, Any]) -> str:
        self.calls.append((name, arguments))
        return json.dumps({"lines": ["panic: replicas must be > 0"]})


def unclear_bundle(gaps: list[Gap] | None = None) -> EvidenceBundle:
    pod = PodSnapshot(
        ref="Pod/shop/worker-7f9c-a",
        name="worker-7f9c-a",
        namespace="shop",
        phase="Running",
        owner="ReplicaSet/worker-7f9c",
        labels={"app": "worker", "pod-template-hash": "7f9c"},
        unhealthy=True,
        containers=[
            ContainerSnapshot(
                name="app",
                image="shop/worker:2",
                state="waiting",
                reason="CrashLoopBackOff",
                restart_count=4,
                last_exit_code=2,
            )
        ],
    )
    logs = LogExcerpt(
        ref=f"{pod.ref}/app", pod=pod.ref, container="app", previous=True, lines=["booting"]
    )
    return EvidenceBundle(
        scope=Scope(cluster_id="kubeconfig:test", namespace="shop"),
        collected_at=NOW,
        pods=[pod],
        logs=[logs],
        gaps=gaps or [],
    )


def incident_of(bundle: EvidenceBundle) -> Incident:
    [incident] = correlate(run_detectors(bundle))
    return incident


def test_parse_answer_tolerates_fences_and_prose() -> None:
    text = "Here is my analysis:\n```json\n" + json.dumps(ANSWER) + "\n```"
    assert parse_answer(text).root_cause == ANSWER["root_cause"]


def test_parse_answer_clamps_confidence() -> None:
    assert parse_answer(json.dumps(ANSWER | {"confidence": 140})).confidence == 100


async def test_agent_uses_tools_then_answers() -> None:
    bundle = unclear_bundle()
    llm = FakeLLM(
        [
            LLMReply(
                content=None,
                tool_calls=[
                    ToolCall(
                        "c1",
                        "get_pod_logs",
                        {"namespace": "shop", "pod": "worker-7f9c-a", "previous": True},
                    )
                ],
            ),
            LLMReply(content=json.dumps(ANSWER)),
        ]
    )
    tools = FakeTools()
    answer, steps = await investigate(incident_of(bundle), bundle, llm, tools, max_steps=4)  # type: ignore[arg-type]

    assert answer.root_cause == ANSWER["root_cause"]
    assert [s.tool for s in steps] == ["get_pod_logs"]
    assert tools.calls[0][1]["previous"] is True
    tool_message = llm.calls[1][-1]
    assert tool_message["role"] == "tool" and tool_message["tool_call_id"] == "c1"


async def test_agent_recovers_from_invalid_json_once() -> None:
    bundle = unclear_bundle()
    llm = FakeLLM(
        [LLMReply(content="I think it is the config."), LLMReply(content=json.dumps(ANSWER))]
    )
    answer, _ = await investigate(incident_of(bundle), bundle, llm, FakeTools(), max_steps=4)  # type: ignore[arg-type]
    assert answer.confidence == 80


async def test_agent_fails_after_second_invalid_reply() -> None:
    bundle = unclear_bundle()
    llm = FakeLLM([LLMReply(content="nope"), LLMReply(content="still nope")])
    with pytest.raises(AgentFailedError):
        await investigate(incident_of(bundle), bundle, llm, FakeTools(), max_steps=4)  # type: ignore[arg-type]


async def test_agent_forces_answer_at_step_limit() -> None:
    bundle = unclear_bundle()
    call = LLMReply(content=None, tool_calls=[ToolCall("c", "list_pods", {"namespace": "shop"})])
    llm = FakeLLM([call, call, LLMReply(content=json.dumps(ANSWER))])
    _, steps = await investigate(incident_of(bundle), bundle, llm, FakeTools(), max_steps=2)  # type: ignore[arg-type]
    assert len(steps) == 2
    assert "Stop investigating" in llm.calls[-1][-1]["content"]


@pytest.fixture
def patched_collect(monkeypatch: pytest.MonkeyPatch) -> EvidenceBundle:
    bundle = unclear_bundle()

    async def fake_collect(*args: Any, **kwargs: Any) -> EvidenceBundle:
        return bundle

    monkeypatch.setattr(service, "collect_evidence", fake_collect)
    monkeypatch.setattr(service, "AgentTools", lambda api: FakeTools())
    return bundle


async def test_service_without_llm_falls_back_to_rules(patched_collect: EvidenceBundle) -> None:
    report = await service.diagnose(None, patched_collect.scope, Settings(), llm=None)  # type: ignore[arg-type]
    [diagnosis] = report.diagnoses
    assert diagnosis.source == "rules"
    assert diagnosis.note == service.NO_LLM_NOTE
    assert not report.healthy


async def test_service_uses_agent_for_unclear_incident(patched_collect: EvidenceBundle) -> None:
    llm = FakeLLM([LLMReply(content=json.dumps(ANSWER))])
    report = await service.diagnose(None, patched_collect.scope, Settings(), llm=llm)  # type: ignore[arg-type]
    [diagnosis] = report.diagnoses
    assert diagnosis.source == "ai"
    assert diagnosis.root_cause == ANSWER["root_cause"]
    assert report.llm_model == "fake/model"


async def test_service_survives_llm_errors(patched_collect: EvidenceBundle) -> None:
    llm = FakeLLM([LLMError("Cannot reach the LLM endpoint")])
    report = await service.diagnose(None, patched_collect.scope, Settings(), llm=llm)  # type: ignore[arg-type]
    [diagnosis] = report.diagnoses
    assert diagnosis.source == "rules"
    assert "Cannot reach the LLM endpoint" in (diagnosis.note or "")


def test_confidence_discounts_ai_only_and_rewards_evidence() -> None:
    bundle = unclear_bundle()
    incident = incident_of(bundle)
    answer = AgentAnswer.model_validate(ANSWER)

    rules_only, _ = score_confidence(incident, bundle)
    with_ai, reasons = score_confidence(incident, bundle, answer, tool_calls=2)
    lazy_ai, _ = score_confidence(incident, bundle, answer, tool_calls=0)

    assert rules_only == 30
    assert with_ai == 68  # 80 * 0.85
    assert lazy_ai == 58
    assert any("AI analysis" in r for r in reasons)


def test_confidence_penalizes_missing_logs() -> None:
    clean, _ = score_confidence(incident_of(unclear_bundle()), unclear_bundle())
    gapped_bundle = unclear_bundle([Gap(collector="logs", error="403")])
    gapped, reasons = score_confidence(incident_of(gapped_bundle), gapped_bundle)
    assert gapped < clean
    assert "Container logs could not be collected" in reasons


def test_bare_model_alias_with_api_base_uses_proxy() -> None:
    from kubeiq.agent.llm import resolve_model

    assert resolve_model("my-claude", "https://llm.example.com") == "openai/my-claude"
    assert resolve_model("my-claude", None) == "my-claude"
    assert resolve_model("anthropic/claude-x", "https://x") == "anthropic/claude-x"
    assert resolve_model("gpt-4o", None) == "gpt-4o"


def test_llm_errors_are_redacted() -> None:
    from kubeiq.agent.llm import _describe

    class AuthenticationError(Exception):
        pass

    message = _describe(AuthenticationError("invalid api_key=sk-abcdefghijklmnopqrstuvwxyz"))
    assert message.startswith("LLM authentication failed")
    assert "sk-abcdefghij" not in message


def test_ai_agreement_ignored_when_rules_had_no_cause() -> None:
    bundle = unclear_bundle()
    answer = AgentAnswer.model_validate(ANSWER | {"agrees_with_rules": True})
    score, reasons = score_confidence(incident_of(bundle), bundle, answer, tool_calls=2)
    assert score == 68
    assert "AI agrees with the rule-based cause" not in reasons


async def test_service_investigates_unclear_incidents_in_parallel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    first, second = unclear_bundle(), unclear_bundle()
    other = second.pods[0].model_copy(
        update={
            "ref": "Pod/shop/mailer-9a9a-b",
            "name": "mailer-9a9a-b",
            "owner": "ReplicaSet/mailer-9a9a",
            "labels": {"app": "mailer", "pod-template-hash": "9a9a"},
        }
    )
    bundle = first.model_copy(update={"pods": [*first.pods, other]})

    async def fake_collect(*args: Any, **kwargs: Any) -> EvidenceBundle:
        return bundle

    in_flight = 0
    peak = 0

    class SlowLLM(FakeLLM):
        async def complete(
            self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
        ) -> LLMReply:
            nonlocal in_flight, peak
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.05)
            in_flight -= 1
            return LLMReply(content=json.dumps(ANSWER))

    monkeypatch.setattr(service, "collect_evidence", fake_collect)
    monkeypatch.setattr(service, "AgentTools", lambda api: FakeTools())
    report = await service.diagnose(None, bundle.scope, Settings(), llm=SlowLLM([]))  # type: ignore[arg-type]

    assert peak == 2
    expected_order = [i.workload for i in correlate(run_detectors(bundle))]
    assert [d.workload for d in report.diagnoses] == expected_order
    assert all(d.source == "ai" for d in report.diagnoses)


def test_wordy_root_cause_is_trimmed_to_first_sentence() -> None:
    from kubeiq.agent.agent import concise

    wordy = (
        "ConfigMap queue-worker-config sets queue.concurrency to 0 in config.yaml. "
        "The worker rejects that value at startup because it must be between 1 and 64."
    )
    assert (
        concise(wordy) == "ConfigMap queue-worker-config sets queue.concurrency to 0 in config.yaml"
    )
    assert concise("Short cause.") == "Short cause"


def test_tool_calls_are_described_in_plain_language() -> None:
    from kubeiq.agent.agent import describe_call

    assert describe_call("get_pod_logs", {"pod": "web-1", "previous": True}) == (
        "Reading logs of pod web-1 (previous run)"
    )
    assert (
        describe_call("get_configmap", {"namespace": "x", "name": "cfg"}) == "Reading ConfigMap cfg"
    )
    assert describe_call("list_pods", {"namespace": "x"}) == "Listing pods"
