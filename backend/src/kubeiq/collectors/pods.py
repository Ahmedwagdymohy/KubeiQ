"""Pod collector: status, containers, resources and env var references (never Secret values)."""

from datetime import UTC, datetime, timedelta
from typing import Any

from kubernetes.client import ApiClient, CoreV1Api

from kubeiq.collectors.models import (
    Condition,
    ContainerSnapshot,
    EnvSource,
    EnvVar,
    PodSnapshot,
    Scope,
    make_ref,
)
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.security.redaction import redact_env_value

# Waiting reasons that are normal while a pod starts, unless they last too long.
_TRANSIENT_WAITING = {"ContainerCreating", "PodInitializing"}
STUCK_AFTER = timedelta(minutes=5)
RECENT_RESTART = timedelta(hours=1)


def collect(api: ApiClient, scope: Scope) -> list[PodSnapshot]:
    core = CoreV1Api(api)
    if scope.namespace:
        result = core.list_namespaced_pod(scope.namespace, _request_timeout=REQUEST_TIMEOUT)
    else:
        result = core.list_pod_for_all_namespaces(_request_timeout=REQUEST_TIMEOUT)
    now = datetime.now(UTC)
    return [to_snapshot(pod, now) for pod in result.items]


def to_snapshot(pod: Any, now: datetime) -> PodSnapshot:
    meta, spec, status = pod.metadata, pod.spec, pod.status
    owner = next((o for o in meta.owner_references or [] if o.controller), None)
    statuses = {s.name: s for s in (status.container_statuses or [])}
    init_statuses = {s.name: s for s in (status.init_container_statuses or [])}

    containers = [
        _container(c, init_statuses.get(c.name), init=True) for c in spec.init_containers or []
    ] + [_container(c, statuses.get(c.name), init=False) for c in spec.containers]

    snapshot = PodSnapshot(
        ref=make_ref("Pod", meta.namespace, meta.name),
        name=meta.name,
        namespace=meta.namespace,
        phase=status.phase or "Unknown",
        node=spec.node_name,
        owner=f"{owner.kind}/{owner.name}" if owner else None,
        labels=meta.labels or {},
        conditions=[
            Condition(type=c.type, status=c.status, reason=c.reason, message=c.message)
            for c in status.conditions or []
        ],
        containers=containers,
        reason=status.reason,
        message=status.message,
        created_at=meta.creation_timestamp,
    )
    snapshot.unhealthy = is_unhealthy(snapshot, now)
    return snapshot


def is_unhealthy(pod: PodSnapshot, now: datetime) -> bool:
    if pod.phase == "Succeeded":
        return False
    if pod.phase in {"Failed", "Unknown"}:
        return True
    age = now - pod.created_at if pod.created_at else timedelta(0)
    if pod.phase == "Pending" and age > STUCK_AFTER:
        return True
    for c in pod.containers:
        if c.state == "waiting" and (c.reason not in _TRANSIENT_WAITING or age > STUCK_AFTER):
            return True
        if c.state == "terminated" and not c.init and (c.exit_code or 0) != 0:
            return True
        if c.last_finished_at and now - c.last_finished_at < RECENT_RESTART:
            return True
        if pod.phase == "Running" and not c.init and not c.ready and age > STUCK_AFTER:
            return True
    return False


def _container(spec: Any, status: Any, init: bool) -> ContainerSnapshot:
    snap = ContainerSnapshot(
        name=spec.name,
        image=spec.image,
        init=init,
        requests=dict((spec.resources and spec.resources.requests) or {}),
        limits=dict((spec.resources and spec.resources.limits) or {}),
        env=[_env_var(e) for e in spec.env or []],
        env_from=[_env_from(e) for e in spec.env_from or []],
        liveness_probe=_probe(spec.liveness_probe),
        readiness_probe=_probe(spec.readiness_probe),
    )
    if status is None:
        return snap

    snap.ready = bool(status.ready)
    snap.restart_count = status.restart_count or 0
    state = status.state
    if state and state.waiting:
        snap.state, snap.reason, snap.message = (
            "waiting",
            state.waiting.reason,
            state.waiting.message,
        )
    elif state and state.terminated:
        t = state.terminated
        snap.state, snap.reason, snap.message, snap.exit_code = (
            "terminated",
            t.reason,
            t.message,
            t.exit_code,
        )
    elif state and state.running:
        snap.state = "running"

    last = status.last_state and status.last_state.terminated
    if last:
        snap.last_reason, snap.last_exit_code = last.reason, last.exit_code
        snap.last_finished_at = last.finished_at
    return snap


def _env_var(env: Any) -> EnvVar:
    source = env.value_from
    if source is None:
        return EnvVar(
            name=env.name,
            source=EnvSource.VALUE,
            value=redact_env_value(env.name, env.value or ""),
        )
    if source.secret_key_ref:
        ref = source.secret_key_ref
        return EnvVar(
            name=env.name,
            source=EnvSource.SECRET,
            ref=f"{ref.name}/{ref.key}",
            optional=bool(ref.optional),
        )
    if source.config_map_key_ref:
        ref = source.config_map_key_ref
        return EnvVar(
            name=env.name,
            source=EnvSource.CONFIG_MAP,
            ref=f"{ref.name}/{ref.key}",
            optional=bool(ref.optional),
        )
    if source.field_ref:
        return EnvVar(name=env.name, source=EnvSource.FIELD, ref=source.field_ref.field_path)
    return EnvVar(name=env.name, source=EnvSource.RESOURCE)


def _env_from(env_from: Any) -> str:
    if env_from.secret_ref:
        return f"secret/{env_from.secret_ref.name}"
    if env_from.config_map_ref:
        return f"configMap/{env_from.config_map_ref.name}"
    return "unknown"


def _probe(probe: Any) -> str | None:
    if probe is None:
        return None
    if probe.http_get:
        target = f"http-get :{probe.http_get.port}{probe.http_get.path or '/'}"
    elif probe.tcp_socket:
        target = f"tcp :{probe.tcp_socket.port}"
    elif probe._exec:
        target = "exec"
    elif probe.grpc:
        target = f"grpc :{probe.grpc.port}"
    else:
        target = "unknown"
    return (
        f"{target} delay={probe.initial_delay_seconds or 0}s period={probe.period_seconds or 10}s "
        f"timeout={probe.timeout_seconds or 1}s failure={probe.failure_threshold or 3}"
    )
