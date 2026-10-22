"""The final, user-facing diagnosis and how confidence is computed."""

from typing import Literal

from pydantic import BaseModel, Field

from kubeiq.collectors.models import EvidenceBundle, Gap
from kubeiq.detectors.models import Certainty, Incident, Severity


class AgentAnswer(BaseModel):
    """Schema the LLM must return."""

    root_cause: str
    explanation: str
    fix_steps: list[str] = Field(default_factory=list)
    commands: list[str] = Field(default_factory=list)
    prevention: str | None = None
    confidence: int = Field(ge=0, le=100)
    evidence: list[str] = Field(default_factory=list)
    agrees_with_rules: bool | None = None


class ToolStep(BaseModel):
    tool: str
    arguments: dict[str, object]
    ok: bool


class Diagnosis(BaseModel):
    incident_id: str
    title: str
    workload: str
    severity: Severity
    root_cause: str
    explanation: str
    fix_steps: list[str] = Field(default_factory=list)
    commands: list[str] = Field(default_factory=list)
    prevention: str | None = None
    confidence: int
    confidence_reasons: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    affected: list[str] = Field(default_factory=list)
    related: list[str] = Field(default_factory=list)
    source: Literal["rules", "ai"]
    agent_steps: list[ToolStep] = Field(default_factory=list)
    note: str | None = None


class DiagnosisReport(BaseModel):
    cluster_id: str
    namespace: str | None
    healthy: bool
    diagnoses: list[Diagnosis] = Field(default_factory=list)
    gaps: list[Gap] = Field(default_factory=list)
    checked: dict[str, int] = Field(default_factory=dict)  # resources inspected, by kind
    llm_model: str | None = None
    duration_seconds: float


_PREVENTION = {
    "CrashLoopBackOff": "Validate required configuration at startup and in CI before deploying",
    "OOMKilled": "Set memory limits from observed usage and alert when usage nears the limit",
    "ImagePullBackOff": "Pin image tags in CI and verify they exist before rolling out",
    "FailedScheduling": "Right-size resource requests and monitor cluster capacity",
    "ReadinessProbeFailed": "Keep probe ports and paths in sync with the app, and test them in CI",
    "LivenessProbeFailed": "Keep probe ports and paths in sync with the app, and test them in CI",
    "SelectorMismatch": "Define Service selectors and pod labels in one place (Helm, Kustomize)",
}

_BASE = {Certainty.HIGH: 92, Certainty.MEDIUM: 72, Certainty.LOW: 50, Certainty.NONE: 30}


def score_confidence(
    incident: Incident,
    bundle: EvidenceBundle,
    answer: AgentAnswer | None = None,
    tool_calls: int = 0,
) -> tuple[int, list[str]]:
    root = incident.root
    score = float(_BASE[root.certainty])
    reasons = [
        f"Rule-based detector certainty: {root.certainty.name.lower()}"
        if root.certainty
        else "No rule matched a specific cause"
    ]
    if root.evidence:
        reasons.append(f"{len(root.evidence)} supporting evidence item(s)")
    if root.details.get("occurrences", 1) > 1:
        score += 2
        reasons.append(f"Same cause seen on {root.details['occurrences']} pods")

    log_gap = any(g.collector == "logs" for g in bundle.gaps)
    if log_gap and root.type == "CrashLoopBackOff":
        score -= 15
        reasons.append("Container logs could not be collected")
    elif bundle.gaps:
        score -= 5
        reasons.append(f"Partial evidence: {', '.join(g.collector for g in bundle.gaps)} missing")

    if answer is not None:
        if root.certainty == Certainty.NONE:
            score = answer.confidence * 0.85
            reasons.append(f"AI analysis (self-reported {answer.confidence}%, discounted)")
        else:
            score = 0.6 * score + 0.4 * answer.confidence
            reasons.append(f"AI analysis self-reported {answer.confidence}%")
        # Agreement only means something when the rules actually proposed a cause.
        agrees = answer.agrees_with_rules if root.cause else None
        if agrees is True:
            score += 5
            reasons.append("AI agrees with the rule-based cause")
        elif agrees is False:
            score -= 15
            reasons.append("AI disagrees with the rule-based cause")
        if tool_calls == 0 and root.certainty == Certainty.NONE:
            score -= 10
            reasons.append("AI did not gather additional evidence")

    return max(5, min(97, round(score))), reasons


def from_rules(incident: Incident, bundle: EvidenceBundle, note: str | None = None) -> Diagnosis:
    root = incident.root
    confidence, reasons = score_confidence(incident, bundle)
    explanation = root.summary + "."
    if root.cause:
        explanation += f" {root.cause}."
    if incident.related:
        explanation += " Impact: " + "; ".join(f.summary for f in incident.related[:3]) + "."
    return Diagnosis(
        incident_id=incident.id,
        title=incident.title,
        workload=incident.workload,
        severity=incident.severity,
        root_cause=root.cause or root.summary,
        explanation=explanation,
        fix_steps=[root.fix] if root.fix else [],
        commands=root.commands,
        prevention=_PREVENTION.get(root.type),
        confidence=confidence,
        confidence_reasons=reasons,
        evidence=root.evidence,
        affected=incident.affected,
        related=[f.summary for f in incident.related],
        source="rules",
        note=note,
    )


def from_agent(
    incident: Incident, bundle: EvidenceBundle, answer: AgentAnswer, steps: list[ToolStep]
) -> Diagnosis:
    confidence, reasons = score_confidence(incident, bundle, answer, tool_calls=len(steps))
    return Diagnosis(
        incident_id=incident.id,
        title=incident.title,
        workload=incident.workload,
        severity=incident.severity,
        root_cause=answer.root_cause,
        explanation=answer.explanation,
        fix_steps=answer.fix_steps,
        commands=answer.commands or incident.root.commands,
        prevention=answer.prevention,
        confidence=confidence,
        confidence_reasons=reasons,
        evidence=answer.evidence + incident.root.evidence,
        affected=incident.affected,
        related=[f.summary for f in incident.related],
        source="ai",
        agent_steps=steps,
    )
