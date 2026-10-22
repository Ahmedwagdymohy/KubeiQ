"""End-to-end diagnosis: collect -> detect -> correlate -> rules or AI per incident."""

import time
from typing import Literal

from kubernetes.client import ApiClient
from loguru import logger

from kubeiq.agent.agent import AgentFailedError, investigate
from kubeiq.agent.diagnosis import DiagnosisReport, from_agent, from_rules
from kubeiq.agent.llm import LLMClient, LLMError
from kubeiq.agent.tools import AgentTools
from kubeiq.collectors.models import ProgressEvent, Scope
from kubeiq.collectors.runner import ProgressCallback, collect_evidence
from kubeiq.core.config import Settings
from kubeiq.detectors.correlate import correlate
from kubeiq.detectors.registry import run_detectors

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
    diagnoses = []
    ai_budget = settings.agent_max_incidents
    for incident in incidents:
        if not incident.needs_ai:
            diagnoses.append(from_rules(incident, bundle))
            continue
        if llm is None:
            diagnoses.append(from_rules(incident, bundle, note=NO_LLM_NOTE))
            continue
        if ai_budget == 0:
            diagnoses.append(
                from_rules(incident, bundle, note="AI investigation limit reached for this run")
            )
            continue
        ai_budget -= 1
        await emit("agent", "started", f"Investigating {incident.title}")
        try:
            answer, steps = await investigate(
                incident, bundle, llm, tools, settings.agent_max_steps, on_progress
            )
            diagnoses.append(from_agent(incident, bundle, answer, steps))
            await emit("agent", "completed", f"{incident.title}: {answer.root_cause}")
        except (LLMError, AgentFailedError) as exc:
            logger.warning("AI investigation failed for {}: {}", incident.id, exc)
            diagnoses.append(from_rules(incident, bundle, note=f"AI investigation failed: {exc}"))
            await emit("agent", "failed", str(exc))

    return DiagnosisReport(
        cluster_id=scope.cluster_id,
        namespace=scope.namespace,
        healthy=not diagnoses,
        diagnoses=diagnoses,
        gaps=bundle.gaps,
        llm_model=llm.model if llm else None,
        duration_seconds=round(time.monotonic() - started, 2),
    )
