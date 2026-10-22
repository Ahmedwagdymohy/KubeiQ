"""End-to-end diagnosis: collect -> detect -> correlate -> rules or AI per incident."""

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Literal

from kubernetes.client import ApiClient
from loguru import logger

from kubeiq.agent.agent import AgentFailedError, investigate
from kubeiq.agent.diagnosis import Diagnosis, DiagnosisReport, from_agent, from_rules
from kubeiq.agent.llm import LLMClient, LLMError
from kubeiq.agent.tools import AgentTools
from kubeiq.collectors.models import EvidenceBundle, ProgressEvent, Scope
from kubeiq.collectors.runner import ProgressCallback, collect_evidence
from kubeiq.core.config import Settings
from kubeiq.detectors.correlate import correlate
from kubeiq.detectors.models import Incident
from kubeiq.detectors.registry import run_detectors

_Emit = Callable[[str, Literal["started", "completed", "failed"], str | None], Awaitable[None]]

NO_LLM_NOTE = "Rules could not pin down the cause. Configure an LLM for a deeper AI investigation"


async def diagnose(
    api: ApiClient,
    scope: Scope,
    settings: Settings,
    llm: LLMClient | None,
    on_progress: ProgressCallback | None = None,
) -> DiagnosisReport:
    started = time.monotonic()

    async def emit(
        step: str, status: Literal["started", "completed", "failed"], detail: str | None = None
    ) -> None:
        if on_progress:
            await on_progress(ProgressEvent(step=step, status=status, detail=detail))

    bundle = await collect_evidence(api, scope, on_progress)

    await emit("detect", "started")
    incidents = correlate(run_detectors(bundle))
    unclear = sum(i.needs_ai for i in incidents)
    await emit(
        "detect", "completed", f"{len(incidents)} incident(s), {unclear} need deeper analysis"
    )

    tools = AgentTools(api)
    diagnoses: list[Diagnosis | None] = [None] * len(incidents)
    ai_jobs: list[tuple[int, Incident]] = []
    for index, incident in enumerate(incidents):
        if not incident.needs_ai:
            diagnoses[index] = from_rules(incident, bundle)
        elif llm is None:
            diagnoses[index] = from_rules(incident, bundle, note=NO_LLM_NOTE)
        elif len(ai_jobs) >= settings.agent_max_incidents:
            diagnoses[index] = from_rules(
                incident, bundle, note="AI investigation limit reached for this run"
            )
        else:
            ai_jobs.append((index, incident))

    if llm is not None and ai_jobs:
        # Investigate unclear incidents concurrently; each is independent.
        results = await asyncio.gather(
            *(
                _investigate_one(incident, bundle, llm, tools, settings, emit, on_progress)
                for _, incident in ai_jobs
            )
        )
        for (index, _), diagnosis in zip(ai_jobs, results, strict=True):
            diagnoses[index] = diagnosis

    return DiagnosisReport(
        cluster_id=scope.cluster_id,
        namespace=scope.namespace,
        healthy=not incidents,
        diagnoses=[d for d in diagnoses if d is not None],
        gaps=bundle.gaps,
        llm_model=llm.model if llm else None,
        duration_seconds=round(time.monotonic() - started, 2),
    )


async def _investigate_one(
    incident: Incident,
    bundle: EvidenceBundle,
    llm: LLMClient,
    tools: AgentTools,
    settings: Settings,
    emit: _Emit,
    on_progress: ProgressCallback | None,
) -> Diagnosis:
    name = incident.workload.split("/")[-1]
    await emit("agent", "started", f"{name}: investigating")
    try:
        answer, steps = await investigate(
            incident, bundle, llm, tools, settings.agent_max_steps, on_progress
        )
    except (LLMError, AgentFailedError) as exc:
        logger.warning("AI investigation failed for {}: {}", incident.id, exc)
        await emit("agent", "failed", f"{name}: {exc}")
        return from_rules(incident, bundle, note=f"AI investigation failed: {exc}")
    await emit("agent", "completed", f"{name}: {answer.root_cause}")
    return from_agent(incident, bundle, answer, steps)
