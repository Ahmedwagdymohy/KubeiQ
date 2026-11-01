"""Cluster Security scans: start one in the background, store what it found, read it back
within the namespaces a user may see."""

import asyncio
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from loguru import logger
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.clusters.registry import ClusterRegistry
from kubeiq.db.models import DEFAULT_ORG, SecurityItem, SecurityScan
from kubeiq.db.session import get_sessionmaker
from kubeiq.products.security import exposure, merge, runner, tools
from kubeiq.products.security.models import SEVERITIES, ScanResult

KEEP_SCANS = 10  # per cluster, for the trend
_tasks: set[asyncio.Task[None]] = set()


class ScanBusyError(RuntimeError):
    pass


async def latest(session: AsyncSession, cluster_id: str) -> SecurityScan | None:
    return (
        await session.execute(
            select(SecurityScan)
            .where(SecurityScan.org_id == DEFAULT_ORG, SecurityScan.cluster_id == cluster_id)
            .order_by(SecurityScan.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def latest_completed(session: AsyncSession, cluster_id: str) -> SecurityScan | None:
    return (
        await session.execute(
            select(SecurityScan)
            .where(
                SecurityScan.org_id == DEFAULT_ORG,
                SecurityScan.cluster_id == cluster_id,
                SecurityScan.status == "completed",
            )
            .order_by(SecurityScan.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def history(session: AsyncSession, cluster_id: str) -> list[SecurityScan]:
    rows = await session.execute(
        select(SecurityScan)
        .where(
            SecurityScan.org_id == DEFAULT_ORG,
            SecurityScan.cluster_id == cluster_id,
            SecurityScan.status == "completed",
        )
        .order_by(SecurityScan.started_at.desc())
        .limit(KEEP_SCANS)
    )
    return list(rows.scalars())


async def start(
    session: AsyncSession, registry: ClusterRegistry, cluster_id: str, username: str
) -> SecurityScan:
    current = await latest(session, cluster_id)
    if current is not None and current.status == "running":
        raise ScanBusyError("A scan of this cluster is already running")
    scan = SecurityScan(cluster_id=cluster_id, started_by=username, step="Starting")
    session.add(scan)
    await session.commit()
    task = asyncio.create_task(run(registry, scan.id, cluster_id), name=f"security-{scan.id}")
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return scan


async def _update(scan_id: str, **values: Any) -> None:
    async with get_sessionmaker()() as session:
        scan = await session.get(SecurityScan, scan_id)
        if scan is not None:
            for key, value in values.items():
                setattr(scan, key, value)
            await session.commit()


async def run(registry: ClusterRegistry, scan_id: str, cluster_id: str) -> None:
    async def progress(step: str) -> None:
        await _update(scan_id, step=step)

    try:
        api = registry.api_client(cluster_id)
        name = registry.get_cluster(cluster_id).name
        results, runs, refused = await runner.scan(api, name, tools.TOOLS, progress)
        if not results:
            errors = "; ".join(f"{r.tool}: {r.error}" for r in runs if r.error)
            raise RuntimeError(errors or "No scanner finished")
        await progress("Ranking what was found")
        try:
            exposed = await asyncio.to_thread(exposure.exposed_workloads, api)
        except Exception as exc:
            logger.debug("Could not read Services and Ingresses: {}", exc)
            exposed = set()
        # Kubescape's result first: its compliance score is the scan's score.
        results.sort(key=lambda r: r.compliance is None)
        combined = merge.combine(results, exposed)
        await save(scan_id, combined, runs, refused)
    except asyncio.CancelledError:
        await _update(
            scan_id,
            status="failed",
            step=None,
            error="KubeiQ stopped during the scan",
            finished_at=datetime.now(UTC),
        )
        raise
    except Exception as exc:
        logger.warning("Security scan of {} failed: {}", cluster_id, exc)
        await _update(
            scan_id,
            status="failed",
            step=None,
            error=str(exc)[:1000],
            finished_at=datetime.now(UTC),
        )


def summarize(result: ScanResult, runs: list[Any], refused: dict[str, int]) -> dict[str, Any]:
    findings = Counter(f.severity for f in result.findings)
    vulns = Counter(v.severity for v in result.vulnerabilities)
    return {
        "findings": {s: findings.get(s, 0) for s in SEVERITIES},
        "vulnerabilities": {s: vulns.get(s, 0) for s in SEVERITIES},
        "fixable": sum(1 for v in result.vulnerabilities if v.fixed),
        "images": result.images,
        "images_failed": result.images_failed,
        "frameworks": [f.model_dump() for f in result.frameworks],
        "tools": [r.model_dump() for r in runs],
        "refused": refused,
        "categories": dict(Counter(f.category for f in result.findings)),
    }


async def save(scan_id: str, result: ScanResult, runs: list[Any], refused: dict[str, int]) -> None:
    async with get_sessionmaker()() as session:
        scan = await session.get(SecurityScan, scan_id)
        if scan is None:
            return
        rows: list[SecurityItem] = []
        for i, f in enumerate(result.findings):
            rows.append(
                SecurityItem(
                    scan_id=scan_id,
                    type="finding",
                    position=i,
                    namespace=f.target.namespace,
                    severity=f.severity,
                    data=f.model_dump(mode="json"),
                )
            )
        for i, v in enumerate(result.vulnerabilities):
            namespaces = {w.namespace for w in v.workloads}
            # One row per namespace that runs the image, so each user sees their own.
            for namespace in sorted(namespaces, key=lambda n: n or "") or [None]:
                workloads = [w for w in v.workloads if w.namespace == namespace]
                data = v.model_copy(update={"workloads": workloads}).model_dump(mode="json")
                rows.append(
                    SecurityItem(
                        scan_id=scan_id,
                        type="vulnerability",
                        position=i,
                        namespace=namespace,
                        severity=v.severity,
                        data=data,
                    )
                )
        for i, c in enumerate(result.controls):
            rows.append(
                SecurityItem(
                    scan_id=scan_id,
                    type="control",
                    position=i,
                    namespace=None,
                    severity=c.severity,
                    data=c.model_dump(mode="json"),
                )
            )
        session.add_all(rows)
        scan.status = "completed"
        scan.step = None
        scan.finished_at = datetime.now(UTC)
        scan.score = merge.score(result)
        scan.summary = summarize(result, runs, refused)
        await session.commit()
        await prune(session, scan.cluster_id)


async def prune(session: AsyncSession, cluster_id: str) -> None:
    ids = (
        (
            await session.execute(
                select(SecurityScan.id)
                .where(SecurityScan.org_id == DEFAULT_ORG, SecurityScan.cluster_id == cluster_id)
                .order_by(SecurityScan.started_at.desc())
                .offset(KEEP_SCANS)
            )
        )
        .scalars()
        .all()
    )
    if ids:
        # SQLite does not enforce the cascade; delete the rows explicitly.
        await session.execute(delete(SecurityItem).where(SecurityItem.scan_id.in_(ids)))
        await session.execute(delete(SecurityScan).where(SecurityScan.id.in_(ids)))
        await session.commit()


async def items(
    session: AsyncSession,
    scan_id: str,
    kind: str,
    namespaces: set[str] | None,
) -> list[dict[str, Any]]:
    """Rows of one type, in rank order, limited to what the user may see: their namespaces,
    and cluster-scoped objects only with access to the whole cluster (namespaces None)."""
    query = select(SecurityItem.data).where(
        SecurityItem.scan_id == scan_id, SecurityItem.type == kind
    )
    if namespaces is not None:
        query = query.where(SecurityItem.namespace.in_(sorted(namespaces)))
    rows = await session.execute(query.order_by(SecurityItem.position, SecurityItem.id))
    return list(rows.scalars())


async def count_for(session: AsyncSession, scan_id: str, namespaces: set[str]) -> dict[str, int]:
    rows = await session.execute(
        select(SecurityItem.severity, func.count())
        .where(
            SecurityItem.scan_id == scan_id,
            SecurityItem.type == "finding",
            SecurityItem.namespace.in_(sorted(namespaces)),
        )
        .group_by(SecurityItem.severity)
    )
    found = {str(severity): int(n) for severity, n in rows.all()}
    return {s: int(found.get(s, 0)) for s in SEVERITIES}


async def fail_interrupted(session: AsyncSession) -> int:
    """Scans that were running when KubeiQ stopped."""
    rows = (
        (await session.execute(select(SecurityScan).where(SecurityScan.status == "running")))
        .scalars()
        .all()
    )
    for scan in rows:
        scan.status, scan.step = "failed", None
        scan.error = "KubeiQ restarted during the scan"
        scan.finished_at = datetime.now(UTC)
    await session.commit()
    return len(rows)
