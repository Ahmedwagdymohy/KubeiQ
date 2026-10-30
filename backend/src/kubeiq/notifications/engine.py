"""The alert engine: once a minute, one look per cluster (status, pods, nodes, warning events)
feeds every rule. An alert is sent when it starts, again after the cooldown if it is still on,
and once more when it is resolved."""

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from kubernetes.client import ApiClient, CoreV1Api
from loguru import logger

from kubeiq.auth import membership, plan
from kubeiq.auth import repository as auth_repository
from kubeiq.clusters.registry import ClusterRegistry
from kubeiq.core.config import get_settings
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.db.session import get_sessionmaker
from kubeiq.notifications import service
from kubeiq.notifications.models import Alert, Rules

FAILING_REASONS = {
    "CrashLoopBackOff",
    "ImagePullBackOff",
    "ErrImagePull",
    "CreateContainerConfigError",
    "CreateContainerError",
    "InvalidImageName",
    "RunContainerError",
}
NO_RESOLVE = {"event.reason", "investigation.critical"}


@dataclass
class State:
    first_seen: dict[str, datetime] = field(default_factory=dict)  # failing since (debounce)
    firing: dict[str, tuple[Alert, datetime | None]] = field(default_factory=dict)  # last sent
    events_seen: set[str] = field(default_factory=set)


STATE = State()


def link(path: str) -> str | None:
    base = get_settings().app_url
    return f"{base.rstrip('/')}{path}" if base else None


def _owner(pod: Any) -> tuple[str, str]:
    """(kind, name) of the workload a pod belongs to, guessing Deployments from ReplicaSets."""
    refs = pod.metadata.owner_references or []
    if not refs:
        return "Pod", pod.metadata.name
    kind, name = refs[0].kind, refs[0].name
    if kind == "ReplicaSet" and name.count("-") >= 1:
        return "Deployment", name.rsplit("-", 1)[0]
    return kind, name


def observe(
    api: ApiClient, cluster_id: str, cluster: str, rules: Rules, now: datetime
) -> list[Alert]:
    """Everything wrong in one cluster right now (runs in a thread)."""
    core = CoreV1Api(api)
    alerts: list[Alert] = []
    nodes: list[Any] = core.list_node(_request_timeout=REQUEST_TIMEOUT).items
    for node in nodes:
        ready = any(c.type == "Ready" and c.status == "True" for c in node.status.conditions or [])
        if not ready:
            alerts.append(
                Alert(
                    key=f"node.not_ready:{cluster_id}:{node.metadata.name}",
                    rule="node.not_ready",
                    cluster_id=cluster_id,
                    cluster=cluster,
                    title=f"Node {node.metadata.name} is NotReady in {cluster}",
                    text="Its pods may be evicted and new pods will not be scheduled there.",
                    link=link(
                        f"/manager?cluster={cluster_id}&kind=core/v1/nodes&name={node.metadata.name}"
                    ),
                )
            )
    failing: dict[str, tuple[str, str, str, str, int]] = {}
    pods: list[Any] = core.list_pod_for_all_namespaces(_request_timeout=REQUEST_TIMEOUT).items
    for pod in pods:
        statuses = pod.status.container_statuses or [] if pod.status else []
        reason = next(
            (
                s.state.waiting.reason
                for s in statuses
                if s.state and s.state.waiting and s.state.waiting.reason in FAILING_REASONS
            ),
            None,
        )
        if (
            reason is None
            and pod.status
            and pod.status.phase == "Pending"
            and not pod.metadata.deletion_timestamp
        ):
            reason = "Pending"
        if reason is None:
            continue
        kind, name = _owner(pod)
        key = f"workload.failing:{cluster_id}:{pod.metadata.namespace}/{kind}/{name}"
        restarts = sum(s.restart_count or 0 for s in statuses)
        failing.setdefault(key, (pod.metadata.namespace, kind, name, reason, restarts))
    for key, (namespace, kind, name, reason, restarts) in failing.items():
        STATE.first_seen.setdefault(key, now)
        if now - STATE.first_seen[key] < timedelta(minutes=rules.failing_minutes):
            continue
        detail = f"{reason}" + (f", restarted {restarts} times" if restarts else "")
        alerts.append(
            Alert(
                key=key,
                rule="workload.failing",
                cluster_id=cluster_id,
                cluster=cluster,
                title=f"{kind} {name} in {namespace} is failing on {cluster}",
                text=f"{detail} for more than {rules.failing_minutes} minutes. "
                "Cluster Doctor finds the root cause and the fix.",
                link=link(
                    f"/doctor?cluster={cluster_id}&namespace={namespace}&focus={kind}/{namespace}/{name}"
                ),
            )
        )
    for key in [
        k
        for k in STATE.first_seen
        if k.startswith(f"workload.failing:{cluster_id}:") and k not in failing
    ]:
        del STATE.first_seen[key]
    if "event.reason" in rules.enabled and rules.event_reasons:
        wanted = set(rules.event_reasons)
        events: list[Any] = core.list_event_for_all_namespaces(
            field_selector="type=Warning", limit=500, _request_timeout=REQUEST_TIMEOUT
        ).items
        for e in events:
            when = e.last_timestamp or e.event_time or e.metadata.creation_timestamp
            if e.reason not in wanted or not when or now - when > timedelta(minutes=10):
                continue
            uid = f"{e.metadata.uid}:{e.count}"
            if uid in STATE.events_seen:
                continue
            STATE.events_seen.add(uid)
            obj = e.involved_object
            alerts.append(
                Alert(
                    key=f"event.reason:{uid}",
                    rule="event.reason",
                    cluster_id=cluster_id,
                    cluster=cluster,
                    title=f"{e.reason} on {obj.kind} {obj.namespace or ''}/{obj.name} in {cluster}",
                    text=(e.message or "").strip()[:500],
                    link=link("/timeline"),
                )
            )
        if len(STATE.events_seen) > 5000:
            STATE.events_seen.clear()
    return alerts


async def evaluate(registry: ClusterRegistry, now: datetime | None = None) -> list[Alert]:
    """One round: what is wrong now, compared with what was; send starts, repeats, resolutions."""
    now = now or datetime.now(UTC)
    async with get_sessionmaker()() as session:
        doc = await service.load(session)
        if not any(c.get("enabled", True) for c in doc["channels"]):
            return []
        rules = Rules(**doc["rules"])
        wanted = await auth_repository.project_clusters(session)
        hidden = await membership.hidden(session)
        projects = await auth_repository.list_projects(session)
        users = await auth_repository.count_users(session)
    current: list[Alert] = []
    for cluster in registry.list_clusters():
        if cluster.id not in wanted or cluster.id in hidden:
            continue
        status = await registry.check(cluster.id)
        if not status.reachable and status.can_read is not False:
            current.append(
                Alert(
                    key=f"cluster.unreachable:{cluster.id}",
                    rule="cluster.unreachable",
                    cluster_id=cluster.id,
                    cluster=cluster.name,
                    title=f"{cluster.name} is unreachable",
                    text=status.error or "KubeiQ cannot reach its API server.",
                    link=link("/settings#clusters"),
                )
            )
            continue
        if status.can_read is False:
            current.append(
                Alert(
                    key=f"cluster.no_access:{cluster.id}",
                    rule="cluster.no_access",
                    cluster_id=cluster.id,
                    cluster=cluster.name,
                    title=f"KubeiQ lost read access to {cluster.name}",
                    text=status.error or "Investigations and views fail until access is fixed.",
                    link=link("/settings#clusters"),
                )
            )
            continue
        try:
            api = registry.api_client(cluster.id)
            current += await asyncio.wait_for(
                asyncio.to_thread(observe, api, cluster.id, cluster.name, rules, now), 30
            )
        except Exception as exc:
            logger.debug("Alert check failed for {}: {}", cluster.id, exc)
    limits = [
        ("users", users, plan.max_users()),
        ("projects", len(projects), plan.max_projects()),
        ("clusters", len(auth_repository.clusters_of(projects)), plan.max_clusters()),
    ]
    for what, used, most in limits:
        if used >= most:
            current.append(
                Alert(
                    key=f"plan.limit:{what}",
                    rule="plan.limit",
                    cluster_id=None,
                    cluster=None,
                    title=f"The {plan.plan_name()} plan's {what} limit is reached",
                    text=f"{used} of {most} {what}. A license raises the limit.",
                    link=link("/settings#license"),
                )
            )

    cooldown = timedelta(minutes=rules.cooldown_minutes)
    sent: list[Alert] = []
    async with get_sessionmaker()() as session:
        live = {a.key for a in current}
        for alert in current:
            previous = STATE.firing.get(alert.key)
            last = previous[1] if previous else None
            if last is None or now - last >= cooldown:
                count = await service.dispatch(session, alert, now)
                STATE.firing[alert.key] = (alert, now if count else last)
                if count:
                    sent.append(alert)
            else:
                STATE.firing[alert.key] = (alert, last)
        for key, (alert, last) in list(STATE.firing.items()):
            if key in live:
                continue
            del STATE.firing[key]
            if alert.rule in NO_RESOLVE or last is None:
                continue
            resolved = alert.model_copy(
                update={
                    "resolved": True,
                    "title": f"Resolved: {alert.title}",
                    "text": "It is back to normal.",
                }
            )
            if await service.dispatch(session, resolved, now):
                sent.append(resolved)
    return sent


async def investigation_finished(cluster_id: str, investigation_id: str, report: Any) -> None:
    """Called when Cluster Doctor finishes: a critical diagnosis is worth an alert."""
    critical = [d for d in report.diagnoses if d.severity == "critical"]
    if not critical:
        return
    first = critical[0]
    alert = Alert(
        key=f"investigation.critical:{investigation_id}",
        rule="investigation.critical",
        cluster_id=cluster_id,
        cluster=cluster_id.split(":", 1)[-1],
        title=f"Cluster Doctor: {first.title}",
        text=f"{first.root_cause}"
        + (f"\nFix: {first.commands[0]}" if first.commands else "")
        + (f"\n{len(critical) - 1} more critical issues" if len(critical) > 1 else ""),
        link=link(f"/doctor?id={investigation_id}"),
    )
    try:
        async with get_sessionmaker()() as session:
            await service.dispatch(session, alert)
    except Exception:
        logger.exception("Could not send the investigation alert")


async def run_forever(registry: ClusterRegistry, interval: float) -> None:
    while True:
        try:
            await evaluate(registry)
        except Exception:
            logger.exception("Alert check failed")
        await asyncio.sleep(interval)
