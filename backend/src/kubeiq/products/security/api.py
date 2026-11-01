"""Cluster Security API (/api/v1/security), within the user's access.

Viewing results follows the user's namespaces: cluster-scoped findings (cluster roles, the
control plane) and framework scores need access to the whole cluster, like starting a scan.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.agent.llm import LLMError, get_llm
from kubeiq.auth import repository
from kubeiq.auth.deps import CurrentUser, Principal, check
from kubeiq.clusters.base import ClusterNotFoundError
from kubeiq.clusters.errors import describe_error
from kubeiq.clusters.registry import ClusterRegistry, get_registry
from kubeiq.core.config import get_settings
from kubeiq.db.models import SecurityScan
from kubeiq.db.session import get_session
from kubeiq.investigations.models import UtcDatetime
from kubeiq.products.security import ai, service, tools
from kubeiq.products.security.models import Finding, Vulnerability
from kubeiq.settings.service import effective_settings

router = APIRouter(prefix="/security", tags=["security"])

Session = Annotated[AsyncSession, Depends(get_session)]
Registry = Annotated[ClusterRegistry, Depends(get_registry)]
ClusterId = Annotated[str, Query(min_length=1)]
MAX_ROWS = 5000


class ScanOut(BaseModel):
    id: str
    status: str
    step: str | None
    started_by: str
    started_at: UtcDatetime
    finished_at: UtcDatetime | None
    score: int | None
    error: str | None


class ToolOut(BaseModel):
    name: str
    version: str
    installed: bool
    custom: bool  # an admin pointed KubeiQ at their own binary


class StatusOut(BaseModel):
    latest: ScanOut | None
    last_completed: ScanOut | None
    tools: list[ToolOut]
    can_scan: bool  # needs access to the whole cluster


class Point(BaseModel):
    at: UtcDatetime
    score: int | None


class OverviewOut(BaseModel):
    scan: ScanOut
    cluster_wide: bool
    findings: dict[str, int]
    vulnerabilities: dict[str, int]
    fixable: int
    images: int
    frameworks: list[dict[str, Any]]
    tools: list[dict[str, Any]]
    refused: dict[str, int]
    top: list[Finding]
    history: list[Point]
    ai_summary: ai.PostureSummary | None


class ScanIn(BaseModel):
    cluster_id: str = Field(min_length=1)


class FixIn(BaseModel):
    cluster_id: str = Field(min_length=1)
    key: str = Field(min_length=1, max_length=2000)


def _scope(user: Principal, cluster_id: str) -> set[str] | None:
    """The namespaces the user may read in the cluster (None: all of it); 403 when none."""
    clusters = user.access.clusters()
    if not user.is_admin and clusters is not None and cluster_id not in clusters:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your projects do not include this cluster")
    return user.access.namespaces(cluster_id)


def _out(scan: SecurityScan | None) -> ScanOut | None:
    return _one(scan) if scan is not None else None


def _one(scan: SecurityScan) -> ScanOut:
    return ScanOut.model_validate(scan, from_attributes=True)


async def _completed(session: AsyncSession, cluster_id: str) -> SecurityScan:
    scan = await service.latest_completed(session, cluster_id)
    if scan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This cluster has not been scanned yet")
    return scan


@router.get("/status", response_model=StatusOut)
async def get_status(session: Session, user: CurrentUser, cluster_id: ClusterId) -> StatusOut:
    namespaces = _scope(user, cluster_id)
    tool_rows = []
    for name in tools.TOOLS:
        try:
            path = tools.resolve(name)
        except tools.ToolError:
            path = None
        tool_rows.append(
            ToolOut(
                name=name,
                version=tools.REGISTRY[name].version,
                installed=path is not None,
                custom=bool(tools.override(name)),
            )
        )
    return StatusOut(
        latest=_out(await service.latest(session, cluster_id)),
        last_completed=_out(await service.latest_completed(session, cluster_id)),
        tools=tool_rows,
        can_scan=namespaces is None,
    )


@router.post("/scans", response_model=ScanOut, status_code=status.HTTP_202_ACCEPTED)
async def start_scan(
    body: ScanIn, session: Session, registry: Registry, user: CurrentUser
) -> ScanOut:
    """Scanning reads the whole cluster, so it needs access to all of it."""
    check(user, "read", body.cluster_id, None)
    try:
        registry.get_cluster(body.cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    try:
        scan = await service.start(session, registry, body.cluster_id, user.username)
    except service.ScanBusyError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    await repository.record(
        session,
        user.username,
        "security.scan",
        cluster_id=body.cluster_id,
        detail="Started a security scan",
    )
    return _one(scan)


@router.get("/overview", response_model=OverviewOut)
async def get_overview(session: Session, user: CurrentUser, cluster_id: ClusterId) -> OverviewOut:
    namespaces = _scope(user, cluster_id)
    scan = await _completed(session, cluster_id)
    summary = scan.summary or {}
    rows = await service.items(session, scan.id, "finding", namespaces)
    cluster_wide = namespaces is None
    findings = summary.get("findings") or {}
    vulnerabilities = summary.get("vulnerabilities") or {}
    if namespaces is not None:
        findings = await service.count_for(session, scan.id, namespaces)
        vulns = [
            Vulnerability.model_validate(v)
            for v in await service.items(session, scan.id, "vulnerability", namespaces)
        ]
        vulnerabilities = {s: sum(1 for v in vulns if v.severity == s) for s in findings}
    return OverviewOut(
        scan=_one(scan),
        cluster_wide=cluster_wide,
        findings=findings,
        vulnerabilities=vulnerabilities,
        fixable=int(summary.get("fixable") or 0) if cluster_wide else 0,
        images=int(summary.get("images") or 0),
        frameworks=summary.get("frameworks") or [] if cluster_wide else [],
        tools=summary.get("tools") or [],
        refused=summary.get("refused") or {},
        top=[Finding.model_validate(r) for r in rows[:8]],
        history=[
            Point(at=s.started_at, score=s.score)
            for s in reversed(await service.history(session, cluster_id))
        ],
        ai_summary=ai.PostureSummary.model_validate(scan.ai_summary)
        if cluster_wide and scan.ai_summary
        else None,
    )


@router.get("/findings", response_model=list[Finding])
async def get_findings(session: Session, user: CurrentUser, cluster_id: ClusterId) -> list[Finding]:
    namespaces = _scope(user, cluster_id)
    scan = await _completed(session, cluster_id)
    rows = await service.items(session, scan.id, "finding", namespaces)
    return [Finding.model_validate(r) for r in rows[:MAX_ROWS]]


@router.get("/vulnerabilities", response_model=list[Vulnerability])
async def get_vulnerabilities(
    session: Session, user: CurrentUser, cluster_id: ClusterId
) -> list[Vulnerability]:
    namespaces = _scope(user, cluster_id)
    scan = await _completed(session, cluster_id)
    merged: dict[tuple[str, str, str], Vulnerability] = {}
    # Stored once per namespace that runs the image; put the workloads back together.
    for row in await service.items(session, scan.id, "vulnerability", namespaces):
        v = Vulnerability.model_validate(row)
        key = (v.image, v.id, v.package)
        if key in merged:
            merged[key].workloads.extend(v.workloads)
        else:
            merged[key] = v
    return list(merged.values())[:MAX_ROWS]


@router.get("/controls")
async def get_controls(
    session: Session, user: CurrentUser, cluster_id: ClusterId
) -> list[dict[str, Any]]:
    """Framework controls describe the whole cluster: access to all of it is needed."""
    check(user, "read", cluster_id, None)
    scan = await _completed(session, cluster_id)
    return await service.items(session, scan.id, "control", None)


async def _llm(session: AsyncSession) -> Any:
    llm = get_llm(await effective_settings(session, get_settings()))
    if llm is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect an AI model in Settings first")
    return llm


@router.post("/summary", response_model=ai.PostureSummary)
async def summarize(body: ScanIn, session: Session, user: CurrentUser) -> ai.PostureSummary:
    """A plain summary of the latest scan, written once and kept with it."""
    check(user, "read", body.cluster_id, None)
    scan = await _completed(session, body.cluster_id)
    if scan.ai_summary:
        return ai.PostureSummary.model_validate(scan.ai_summary)
    llm = await _llm(session)
    findings = [
        Finding.model_validate(r)
        for r in (await service.items(session, scan.id, "finding", None))[:20]
    ]
    vulns = [
        Vulnerability.model_validate(r)
        for r in (await service.items(session, scan.id, "vulnerability", None))[:15]
    ]
    try:
        result = await ai.summarize(
            llm, ai.summary_input(scan.score, scan.summary or {}, findings, vulns)
        )
    except LLMError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "The AI reply was not usable. Try again"
        ) from exc
    scan.ai_summary = result.model_dump()
    await session.commit()
    return result


@router.post("/fix", response_model=ai.FindingFix)
async def fix_finding(
    body: FixIn, session: Session, registry: Registry, user: CurrentUser
) -> ai.FindingFix:
    namespaces = _scope(user, body.cluster_id)
    scan = await _completed(session, body.cluster_id)
    rows = await service.items(session, scan.id, "finding", namespaces)
    found = next((Finding.model_validate(r) for r in rows if r.get("key") == body.key), None)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That finding is not in the latest scan")
    check(user, "read", body.cluster_id, found.target.namespace)
    llm = await _llm(session)
    try:
        api = registry.api_client(body.cluster_id)
        return await ai.fix(llm, api, found)
    except ClusterNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, str(exc) or "The AI reply was not usable"
        ) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, describe_error(exc)) from exc
