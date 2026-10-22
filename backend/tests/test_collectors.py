from datetime import UTC, datetime, timedelta
from typing import Any

from kubernetes.client import (
    CoreV1Event,
    V1Container,
    V1ContainerState,
    V1ContainerStateRunning,
    V1ContainerStateTerminated,
    V1ContainerStateWaiting,
    V1ContainerStatus,
    V1EnvVar,
    V1EnvVarSource,
    V1ObjectMeta,
    V1ObjectReference,
    V1OwnerReference,
    V1Pod,
    V1PodSpec,
    V1PodStatus,
    V1SecretKeySelector,
    V1Service,
    V1ServicePort,
    V1ServiceSpec,
)
from kubernetes.client.models import V1Endpoint, V1EndpointConditions, V1EndpointSlice

from kubeiq.collectors import events, logs, pods, services
from kubeiq.collectors.models import EnvSource
from kubeiq.security.redaction import MASK

NOW = datetime(2026, 10, 22, 12, 0, tzinfo=UTC)


def make_pod(
    state: V1ContainerState,
    *,
    phase: str = "Running",
    ready: bool = False,
    restarts: int = 0,
    last: V1ContainerStateTerminated | None = None,
    age: timedelta = timedelta(hours=2),
    env: list[V1EnvVar] | None = None,
) -> V1Pod:
    return V1Pod(
        metadata=V1ObjectMeta(
            name="payment-7f9",
            namespace="shop",
            labels={"app": "payment"},
            creation_timestamp=NOW - age,
            owner_references=[
                V1OwnerReference(
                    api_version="apps/v1",
                    kind="ReplicaSet",
                    name="payment-7f9c",
                    uid="1",
                    controller=True,
                )
            ],
        ),
        spec=V1PodSpec(containers=[V1Container(name="app", image="shop/payment:1.2", env=env)]),
        status=V1PodStatus(
            phase=phase,
            container_statuses=[
                V1ContainerStatus(
                    name="app",
                    image="shop/payment:1.2",
                    image_id="",
                    ready=ready,
                    restart_count=restarts,
                    state=state,
                    last_state=V1ContainerState(terminated=last) if last else None,
                )
            ],
        ),
    )


def crashloop_pod(**kw: Any) -> V1Pod:
    return make_pod(
        V1ContainerState(waiting=V1ContainerStateWaiting(reason="CrashLoopBackOff")),
        restarts=12,
        last=V1ContainerStateTerminated(
            exit_code=1, reason="Error", finished_at=NOW - timedelta(minutes=1)
        ),
        **kw,
    )


class TestPods:
    def test_crashloop_snapshot(self) -> None:
        snap = pods.to_snapshot(crashloop_pod(), NOW)
        app = snap.containers[0]

        assert snap.ref == "Pod/shop/payment-7f9"
        assert snap.owner == "ReplicaSet/payment-7f9c"
        assert snap.unhealthy
        assert (app.state, app.reason, app.restart_count) == ("waiting", "CrashLoopBackOff", 12)
        assert (app.last_reason, app.last_exit_code) == ("Error", 1)

    def test_running_ready_pod_is_healthy(self) -> None:
        pod = make_pod(V1ContainerState(running=V1ContainerStateRunning()), ready=True)
        assert not pods.to_snapshot(pod, NOW).unhealthy

    def test_old_restart_is_not_unhealthy(self) -> None:
        pod = make_pod(
            V1ContainerState(running=V1ContainerStateRunning()),
            ready=True,
            restarts=1,
            last=V1ContainerStateTerminated(exit_code=137, finished_at=NOW - timedelta(days=3)),
        )
        assert not pods.to_snapshot(pod, NOW).unhealthy

    def test_container_creating_is_unhealthy_only_when_stuck(self) -> None:
        state = V1ContainerState(waiting=V1ContainerStateWaiting(reason="ContainerCreating"))
        fresh = make_pod(state, phase="Pending", age=timedelta(seconds=30))
        stuck = make_pod(state, phase="Pending", age=timedelta(minutes=10))
        assert not pods.to_snapshot(fresh, NOW).unhealthy
        assert pods.to_snapshot(stuck, NOW).unhealthy

    def test_env_never_exposes_secret_values(self) -> None:
        env = [
            V1EnvVar(name="DB_PASSWORD", value="hunter2"),
            V1EnvVar(name="LOG_LEVEL", value="debug"),
            V1EnvVar(
                name="API_TOKEN",
                value_from=V1EnvVarSource(
                    secret_key_ref=V1SecretKeySelector(name="api", key="token")
                ),
            ),
        ]
        snap = pods.to_snapshot(crashloop_pod(env=env), NOW)
        by_name = {e.name: e for e in snap.containers[0].env}

        assert by_name["DB_PASSWORD"].value == MASK
        assert by_name["LOG_LEVEL"].value == "debug"
        assert by_name["API_TOKEN"].source is EnvSource.SECRET
        assert by_name["API_TOKEN"].ref == "api/token"
        assert by_name["API_TOKEN"].value is None


class TestEvents:
    @staticmethod
    def event(reason: str, minutes_ago: int, count: int = 1, name: str = "e1") -> CoreV1Event:
        return CoreV1Event(
            metadata=V1ObjectMeta(name=name, namespace="shop"),
            involved_object=V1ObjectReference(kind="Pod", namespace="shop", name="payment-7f9"),
            type="Warning",
            reason=reason,
            message=f"{reason} happened",
            count=count,
            last_timestamp=NOW - timedelta(minutes=minutes_ago),
        )

    def test_dedupes_and_sorts_newest_first(self) -> None:
        records = events.summarize(
            [
                self.event("BackOff", 10, count=3, name="a"),
                self.event("BackOff", 2, count=4, name="b"),
                self.event("FailedMount", 5, name="c"),
            ],
            NOW,
        )
        assert [r.reason for r in records] == ["BackOff", "FailedMount"]
        assert records[0].count == 7
        assert records[0].involved == "Pod/shop/payment-7f9"

    def test_drops_events_outside_window(self) -> None:
        assert events.summarize([self.event("BackOff", 120)], NOW) == []


class TestServices:
    def test_counts_endpoints_per_service(self) -> None:
        svc = V1Service(
            metadata=V1ObjectMeta(name="payment", namespace="shop"),
            spec=V1ServiceSpec(
                selector={"app": "payments"},
                ports=[V1ServicePort(port=80, target_port=8080, protocol="TCP")],
            ),
        )
        endpoint_slice = V1EndpointSlice(
            address_type="IPv4",
            metadata=V1ObjectMeta(
                name="payment-abc",
                namespace="shop",
                labels={services.SERVICE_NAME_LABEL: "payment"},
            ),
            endpoints=[
                V1Endpoint(addresses=["10.0.0.1"], conditions=V1EndpointConditions(ready=True)),
                V1Endpoint(addresses=["10.0.0.2"], conditions=V1EndpointConditions(ready=False)),
            ],
        )
        [snap] = services.build([svc], [endpoint_slice])

        assert snap.selector == {"app": "payments"}
        assert snap.ports == ["80->8080/TCP"]
        assert (snap.ready_endpoints, snap.not_ready_endpoints) == (1, 1)


class TestLogs:
    def test_reads_previous_run_for_restarting_container(self) -> None:
        container = pods.to_snapshot(crashloop_pod(), NOW).containers[0]
        assert logs.targets(container) == [False, True]

    def test_skips_container_that_never_started(self) -> None:
        pod = make_pod(V1ContainerState(waiting=V1ContainerStateWaiting(reason="ErrImagePull")))
        assert logs.targets(pods.to_snapshot(pod, NOW).containers[0]) == []

    def test_condense_keeps_errors_and_tail_and_redacts(self) -> None:
        lines = [f"info line {i}" for i in range(300)]
        lines[10] = "ERROR: DATABASE_URL is missing"
        lines[20] = "connecting with password=hunter2 failed"
        kept, truncated = logs.condense(lines)

        assert truncated
        assert kept[0] == "ERROR: DATABASE_URL is missing"
        assert "hunter2" not in kept[1]
        assert kept[-1] == "info line 299"
        assert len(kept) == logs.KEEP_TAIL + 2


def test_logs_handle_empty_output() -> None:
    class EmptyLogs:
        def read_namespaced_pod_log(self, *args: Any, **kwargs: Any) -> None:
            return None

    snap = pods.to_snapshot(crashloop_pod(), NOW)
    excerpt = logs._fetch(EmptyLogs(), snap, "app", previous=True)  # type: ignore[arg-type]
    assert excerpt.lines == []
    assert excerpt.error is None


def test_pod_snapshot_includes_volumes_and_mounts() -> None:
    from kubernetes.client import V1ConfigMapVolumeSource, V1Volume, V1VolumeMount

    raw = crashloop_pod()
    raw.spec.volumes = [
        V1Volume(name="config", config_map=V1ConfigMapVolumeSource(name="worker-config"))
    ]
    raw.spec.containers[0].volume_mounts = [V1VolumeMount(name="config", mount_path="/etc/worker")]
    snap = pods.to_snapshot(raw, NOW)

    assert snap.volumes == ["config: configMap/worker-config"]
    assert snap.containers[0].mounts == ["config:/etc/worker"]
