"""Findings produced by detectors and incidents produced by correlation."""

from enum import IntEnum, StrEnum
from typing import Any

from pydantic import BaseModel, Field


class Severity(StrEnum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class Certainty(IntEnum):
    """How sure a detector is about the *cause* (not the symptom)."""

    NONE = 0  # symptom only, cause unknown
    LOW = 1
    MEDIUM = 2
    HIGH = 3


class Finding(BaseModel):
    detector: str
    type: str  # e.g. "CrashLoopBackOff"
    severity: Severity
    resource: str  # ref of the affected object
    workload: str | None = None  # owning workload ref, used for grouping
    summary: str
    cause: str | None = None
    certainty: Certainty = Certainty.NONE
    fix: str | None = None
    commands: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)  # refs to events, log lines, objects
    symptom: bool = False  # True when this is a consequence of another problem
    details: dict[str, Any] = Field(default_factory=dict)

    @property
    def id(self) -> str:
        return f"{self.detector}:{self.resource}"


class Incident(BaseModel):
    id: str
    title: str
    workload: str
    severity: Severity
    root: Finding
    related: list[Finding] = Field(default_factory=list)
    affected: list[str] = Field(default_factory=list)

    @property
    def needs_ai(self) -> bool:
        """Rules alone are not conclusive; the agent should investigate further."""
        return self.root.certainty < Certainty.HIGH
