"""One feed of what happened: Kubernetes events plus KubeiQ's own entries (investigations,
changes made in Cluster Manager, clusters connected), newest first."""

from datetime import UTC, datetime
from typing import Any, Literal

from kubernetes.client import ApiClient, CoreV1Api
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.db.models import DEFAULT_ORG, AuditEvent, Investigation

EVENT_LIMIT = 300


class TimelineItem(BaseModel):
    id: str
    source: Literal["kubernetes", "kubeiq"]
    type: Literal["Normal", "Warning"]
    reason: str
    message: str
    kind: str | None = None
    name: str | None = None
    namespace: str | None = None
    count: int = 1
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    component: str | None = None  # the kubelet, a controller, or a KubeiQ user
    link: str | None = None  # an investigation to open


def _utc(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value
    return None


def kubernetes_events(api: ApiClient, namespaces: list[str] | None) -> list[TimelineItem]:
    core = CoreV1Api(api)
    items: list[Any] = []
    if namespaces is None:
        items = core.list_event_for_all_namespaces(
            limit=EVENT_LIMIT, _request_timeout=REQUEST_TIMEOUT
        ).items
    else:
        for ns in namespaces:
            items += core.list_namespaced_event(
                ns, limit=EVENT_LIMIT, _request_timeout=REQUEST_TIMEOUT
            ).items
    out = []
    for e in items:
        involved = e.involved_object
        last = _utc(e.last_timestamp) or _utc(e.event_time) or _utc(e.metadata.creation_timestamp)
        out.append(
            TimelineItem(
                id=f"k8s:{e.metadata.uid}",
                source="kubernetes",
                type="Warning" if e.type == "Warning" else "Normal",
                reason=e.reason or "",
                message=(e.message or "").strip(),
                kind=involved.kind if involved else None,
                name=involved.name if involved else None,
                namespace=(involved.namespace if involved else None) or e.metadata.namespace,
                count=e.count or 1,
                first_seen=_utc(e.first_timestamp) or _utc(e.metadata.creation_timestamp),
                last_seen=last,
                component=(e.source.component if e.source else None)
                or e.reporting_component
                or None,
            )
        )
    return out


_ACTIONS = {
    "k8s.scale": "Scaled",
    "k8s.restart": "Restarted",
    "k8s.delete": "Deleted",
    "k8s.cordon": "Cordoned",
    "k8s.uncordon": "Uncordoned",
    "k8s.drain": "Drained",
    "k8s.trigger": "Triggered",
    "k8s.suspend": "Suspended",
    "k8s.resume": "Resumed",
    "k8s.edit": "Edited",
    "k8s.create": "Created",
    "k8s.exec": "Opened a terminal",
    "k8s.download": "Downloaded a file",
    "settings.cluster.add": "Connected",
    "settings.kubeconfig.connect": "Connected",
}


async def kubeiq_entries(
    session: AsyncSession, cluster_id: str, namespaces: list[str] | None, limit: int = 100
) -> list[TimelineItem]:
    out: list[TimelineItem] = []
    audits = await session.execute(
        select(AuditEvent)
        .where(AuditEvent.org_id == DEFAULT_ORG, AuditEvent.cluster_id == cluster_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    )
    for a in audits.scalars():
        if a.action not in _ACTIONS and not a.action.startswith("k8s."):
            continue
        if namespaces is not None and a.namespace not in namespaces:
            continue
        kind, _, name = (a.target or "").partition("/")
        verb = _ACTIONS.get(a.action, a.action)
        out.append(
            TimelineItem(
                id=f"audit:{a.id}",
                source="kubeiq",
                type="Normal" if a.ok else "Warning",
                reason=verb if a.ok else f"{verb} failed",
                message=f"{a.username}: {verb.lower()} {a.target or 'the cluster'}"
                + (f" ({a.detail})" if a.detail else ""),
                kind=kind or None,
                name=name or None,
                namespace=a.namespace,
                first_seen=_utc(a.created_at),
                last_seen=_utc(a.created_at),
                component=a.username,
            )
        )
    runs = await session.execute(
        select(Investigation)
        .where(Investigation.org_id == DEFAULT_ORG, Investigation.cluster_id == cluster_id)
        .order_by(Investigation.created_at.desc())
        .limit(30)
    )
    for inv in runs.scalars():
        if namespaces is not None and inv.namespace not in namespaces:
            continue
        where = f"namespace {inv.namespace}" if inv.namespace else "the cluster"
        finished = inv.finished_at is not None
        problems = inv.incident_count
        out.append(
            TimelineItem(
                id=f"inv:{inv.id}",
                source="kubeiq",
                type="Warning" if finished and problems else "Normal",
                reason="Investigation" if finished else "Investigation started",
                message=(inv.summary or f"Found {problems} issues in {where}")
                if finished and problems
                else (
                    f"Nothing wrong in {where}"
                    if finished
                    else f"Cluster Doctor is checking {where}"
                ),
                namespace=inv.namespace,
                first_seen=_utc(inv.created_at),
                last_seen=_utc(inv.finished_at) or _utc(inv.created_at),
                component="Cluster Doctor",
                link=f"/doctor?id={inv.id}",
            )
        )
    return out


def merge(*feeds: list[TimelineItem], limit: int) -> list[TimelineItem]:
    items = [i for feed in feeds for i in feed]
    floor = datetime.min.replace(tzinfo=UTC)
    items.sort(key=lambda i: i.last_seen or floor, reverse=True)
    return items[:limit]
