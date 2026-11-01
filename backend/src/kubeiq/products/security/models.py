"""What a security scan produces, the same whichever scanner found it."""

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["critical", "high", "medium", "low"]
SEVERITIES: tuple[Severity, ...] = ("critical", "high", "medium", "low")
WEIGHT: dict[Severity, int] = {"critical": 10, "high": 6, "medium": 3, "low": 1}
Category = Literal["workload", "access", "network", "cluster", "image"]


def severity_of(value: str | None) -> Severity:
    v = (value or "").lower()
    if v in ("critical", "high", "medium", "low"):
        return v  # type: ignore[return-value]
    return "low"


class Target(BaseModel):
    kind: str
    name: str
    namespace: str | None = None

    @property
    def ref(self) -> str:
        return f"{self.namespace or '-'}/{self.kind}/{self.name}"


class Check(BaseModel):
    """One scanner's rule: Kubescape C-0013, Trivy KSV012."""

    tool: Literal["trivy", "kubescape"]
    id: str
    name: str
    frameworks: list[str] = Field(default_factory=list)


class FixPath(BaseModel):
    """A field to set, from the scanner: spec.template.spec.containers[0]...runAsNonRoot=true."""

    path: str
    value: str


class Finding(BaseModel):
    """One problem on one object. Reports of the same problem by several checks or scanners
    are merged into one finding that lists them all."""

    key: str
    title: str
    severity: Severity
    category: Category
    target: Target
    checks: list[Check]
    description: str = ""
    remediation: str = ""
    fixes: list[FixPath] = Field(default_factory=list)
    risk: int = 0  # severity weight raised by exposure and privilege, for ordering
    reasons: list[str] = Field(default_factory=list)  # why the risk is higher

    @property
    def tools(self) -> list[str]:
        return sorted({c.tool for c in self.checks})


class Vulnerability(BaseModel):
    """A CVE in one image, with the workloads that run that image."""

    image: str
    id: str
    package: str
    installed: str
    fixed: str | None = None
    severity: Severity
    title: str = ""
    url: str | None = None
    workloads: list[Target] = Field(default_factory=list)


class Control(BaseModel):
    """One framework control and how the cluster does on it."""

    framework: str
    id: str
    name: str
    severity: Severity
    status: Literal["passed", "failed", "skipped"]
    passed: int = 0
    failed: int = 0
    note: str | None = None  # why it was skipped


class Framework(BaseModel):
    name: str
    score: float  # 0-100, Kubescape's compliance score
    passed: int
    failed: int
    skipped: int


class ToolRun(BaseModel):
    tool: Literal["trivy", "kubescape"]
    version: str
    ok: bool
    seconds: float = 0
    error: str | None = None


class ScanResult(BaseModel):
    findings: list[Finding] = Field(default_factory=list)
    vulnerabilities: list[Vulnerability] = Field(default_factory=list)
    controls: list[Control] = Field(default_factory=list)
    frameworks: list[Framework] = Field(default_factory=list)
    images: int = 0  # images scanned for vulnerabilities
    images_failed: list[str] = Field(default_factory=list)  # private registries and the like
    compliance: float | None = None  # Kubescape's score over all frameworks scanned
    checked: int = 0  # (object, check) pairs evaluated, for the score without Kubescape
    passed_weight: int = 0
    failed_weight: int = 0
