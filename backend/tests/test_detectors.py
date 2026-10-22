from datetime import UTC, datetime
from typing import Any

import pytest

from kubeiq.collectors.models import (
    Condition,
    ContainerSnapshot,
    EventRecord,
    EvidenceBundle,
    LogExcerpt,
    PodSnapshot,
    Probe,
    Scope,
    ServiceSnapshot,
    WorkloadSnapshot,
)
from kubeiq.detectors.correlate import correlate
from kubeiq.detectors.helpers import workload_of
from kubeiq.detectors.models import Certainty
from kubeiq.detectors.patterns import match_logs
from kubeiq.detectors.registry import run_detectors

NOW = datetime(2026, 10, 22, 12, 0, tzinfo=UTC)


def pod(name: str = "payment-7f9c-abcde", app: str = "payment", **kw: Any) -> PodSnapshot:
    defaults: dict[str, Any] = {
        "ref": f"Pod/shop/{name}",
        "name": name,
        "namespace": "shop",
        "phase": "Running",
        "owner": f"ReplicaSet/{app}-7f9c",
        "labels": {"app": app, "pod-template-hash": "7f9c"},
        "unhealthy": True,
    }
    return PodSnapshot(**(defaults | kw))


def container(**kw: Any) -> ContainerSnapshot:
    return ContainerSnapshot(**({"name": "app", "image": "shop/app:1.0"} | kw))


def event(involved: str, reason: str, message: str) -> EventRecord:
    return EventRecord(
        ref=f"Event/shop/{reason}",
        type="Warning",
        reason=reason,
        message=message,
        involved=involved,
    )


def bundle(**kw: Any) -> EvidenceBundle:
    return EvidenceBundle(scope=Scope(cluster_id="kubeconfig:test"), collected_at=NOW, **kw)


def only_incident(b: EvidenceBundle) -> Any:
    incidents = correlate(run_detectors(b))
    assert len(incidents) == 1, [i.title for i in incidents]
    return incidents[0]


def test_workload_of_maps_replicaset_to_deployment() -> None:
    assert workload_of(pod()) == "Deployment/shop/payment"


def test_crashloop_missing_env_from_previous_logs() -> None:
    p = pod(
        containers=[
            container(
                state="waiting",
                reason="CrashLoopBackOff",
                restart_count=5,
                last_exit_code=1,
                last_reason="Error",
            )
        ]
    )
    logs = LogExcerpt(
        ref=f"{p.ref}/app",
        pod=p.ref,
        container="app",
        previous=True,
        lines=["starting", "FATAL: required environment variable DATABASE_URL is not set"],
    )
    incident = only_incident(bundle(pods=[p], logs=[logs]))

    assert incident.root.type == "CrashLoopBackOff"
    assert incident.root.cause == "Environment variable DATABASE_URL is missing"
    assert incident.root.certainty is Certainty.HIGH
    assert incident.root.commands[0].startswith("kubectl set env deployment/payment DATABASE_URL")
    assert not incident.needs_ai


def test_crashloop_without_known_pattern_needs_ai() -> None:
    p = pod(
        containers=[
            container(state="waiting", reason="CrashLoopBackOff", restart_count=3, last_exit_code=2)
        ]
    )
    incident = only_incident(bundle(pods=[p]))
    assert incident.root.cause is None
    assert incident.needs_ai


def test_oom_uses_memory_limit() -> None:
    p = pod(
        containers=[
            container(
                state="running", restart_count=4, last_reason="OOMKilled", limits={"memory": "64Mi"}
            )
        ]
    )
    incident = only_incident(bundle(pods=[p]))
    assert incident.root.type == "OOMKilled"
    assert incident.root.cause == "Memory limit 64Mi is too low (container OOMKilled)"
    assert "--limits=memory=128Mi" in incident.root.commands[0]


def test_image_pull_wrong_tag_vs_auth() -> None:
    def run(message: str) -> Any:
        p = pod(
            containers=[container(state="waiting", reason="ImagePullBackOff", image="nginx:9.9")]
        )
        return only_incident(bundle(pods=[p], events=[event(p.ref, "Failed", message)])).root

    assert "not found in the registry" in (run("manifest unknown: manifest unknown").cause or "")
    assert "pull secret" in (run("pull access denied, authorization failed: 401").cause or "")


def test_pending_insufficient_memory() -> None:
    p = pod(
        phase="Pending",
        conditions=[
            Condition(
                type="PodScheduled",
                status="False",
                reason="Unschedulable",
                message="0/3 nodes are available: 3 Insufficient memory.",
            )
        ],
        containers=[container(requests={"memory": "64Gi"})],
    )
    root = only_incident(bundle(pods=[p])).root
    assert root.cause == "Pod requests 64Gi memory; no node has that free"
    assert root.commands[0].startswith(
        "kubectl set resources deployment/payment -c app --requests=memory="
    )
    assert root.details["requests"] == {"app": "64Gi"}


def test_readiness_probe_wrong_port() -> None:
    probe = Probe(kind="http-get", port=8081, path="/healthz", summary="http-get :8081/healthz")
    p = pod(unhealthy=False, containers=[container(ports=[80], readiness_probe=probe)])
    message = "Readiness probe failed: Get http://10.0.0.1:8081/healthz: connection refused"
    root = only_incident(bundle(pods=[p], events=[event(p.ref, "Unhealthy", message)])).root
    assert root.cause == "Readiness probe uses port 8081; container listens on 80"
    assert (
        '"path":"/spec/template/spec/containers/0/readinessProbe/httpGet/port","value":80'
        in root.commands[0]
    )


def test_service_selector_typo() -> None:
    svc = ServiceSnapshot(
        ref="Service/shop/checkout",
        name="checkout",
        namespace="shop",
        type="ClusterIP",
        selector={"app": "checkut"},
    )
    p = pod(name="checkout-7f9c-x", app="checkout", unhealthy=False)
    root = only_incident(bundle(pods=[p], services=[svc])).root
    assert root.type == "SelectorMismatch"
    assert root.details["suggested_selector"] == {"app": "checkout"}
    assert root.workload == "Deployment/shop/checkout"


def test_service_with_unready_pods_is_a_symptom_grouped_with_cause() -> None:
    svc = ServiceSnapshot(
        ref="Service/shop/payment",
        name="payment",
        namespace="shop",
        type="ClusterIP",
        selector={"app": "payment"},
    )
    deployment = WorkloadSnapshot(
        ref="Deployment/shop/payment",
        kind="Deployment",
        name="payment",
        namespace="shop",
        desired=2,
        ready=0,
        available=0,
        updated=2,
    )
    p = pod(containers=[container(state="running", restart_count=2, last_reason="OOMKilled")])
    incident = only_incident(bundle(pods=[p], services=[svc], workloads=[deployment]))

    assert incident.root.type == "OOMKilled"
    assert {f.type for f in incident.related} == {"NoReadyEndpoints", "ReplicasUnavailable"}


def test_same_cause_on_many_pods_is_one_incident() -> None:
    def crashing(name: str) -> PodSnapshot:
        return pod(
            name=name,
            containers=[
                container(
                    state="waiting", reason="CrashLoopBackOff", restart_count=1, last_exit_code=127
                )
            ],
        )

    incident = only_incident(bundle(pods=[crashing("payment-7f9c-a"), crashing("payment-7f9c-b")]))
    assert incident.root.details["occurrences"] == 2
    assert incident.root.cause == "Container command not found in the image"


def test_healthy_bundle_has_no_incidents() -> None:
    assert (
        correlate(
            run_detectors(bundle(pods=[pod(unhealthy=False, containers=[container(ready=True)])]))
        )
        == []
    )


def test_log_patterns_prefer_specific_causes() -> None:
    [best, *_] = match_logs(["dial tcp: connection refused", "KeyError: 'REDIS_URL'"])
    assert best.pattern.key == "missing_env"
    assert best.value == "REDIS_URL"


def test_missing_secret_key() -> None:
    message = "couldn't find key password in Secret shop/db-secret"
    p = pod(
        containers=[
            container(state="waiting", reason="CreateContainerConfigError", message=message)
        ]
    )
    root = only_incident(bundle(pods=[p])).root
    assert root.type == "CreateContainerConfigError"
    assert root.cause == "Secret db-secret is missing key 'password'"
    assert root.commands[0].startswith("kubectl patch secret db-secret -n shop --type merge")
    assert root.certainty is Certainty.HIGH


def test_missing_configmap() -> None:
    message = 'configmap "app-config" not found'
    p = pod(
        containers=[
            container(state="waiting", reason="CreateContainerConfigError", message=message)
        ]
    )
    root = only_incident(bundle(pods=[p])).root
    assert root.cause == "ConfigMap app-config does not exist"
    assert root.commands[0].startswith("kubectl create configmap app-config -n shop")


def test_init_container_crashloop() -> None:
    init = container(
        name="wait-for-db",
        init=True,
        state="waiting",
        reason="CrashLoopBackOff",
        restart_count=3,
        last_exit_code=1,
    )
    p = pod(
        phase="Pending", containers=[init, container(state="waiting", reason="PodInitializing")]
    )
    logs = LogExcerpt(
        ref=f"{p.ref}/wait-for-db",
        pod=p.ref,
        container="wait-for-db",
        previous=True,
        lines=["could not resolve host postgres: Name or service not known"],
    )
    root = only_incident(bundle(pods=[p], logs=[logs])).root
    assert root.summary.startswith("Init container 'wait-for-db' keeps crashing")
    assert root.cause == "A hostname the app needs cannot be resolved (DNS)"


def test_unrecognized_failure_goes_to_catch_all() -> None:
    p = pod(
        name="db-migrate-x",
        owner="Job/db-migrate",
        labels={},
        phase="Failed",
        containers=[container(state="terminated", reason="Error", exit_code=3)],
    )
    incident = only_incident(bundle(pods=[p]))
    assert incident.root.detector == "unexplained"
    assert "exit code 3" in incident.root.summary
    assert incident.workload == "Job/shop/db-migrate"
    assert incident.needs_ai


def test_catch_all_beats_rollout_symptom_as_root() -> None:
    deployment = WorkloadSnapshot(
        ref="Deployment/shop/payment",
        kind="Deployment",
        name="payment",
        namespace="shop",
        desired=1,
        ready=0,
        available=0,
        updated=1,
    )
    p = pod(
        containers=[container(state="waiting", reason="RunContainerError", message="mount failed")]
    )
    incident = only_incident(bundle(pods=[p], workloads=[deployment]))
    assert incident.root.detector == "unexplained"
    assert "RunContainerError" in incident.root.summary
    assert [f.type for f in incident.related] == ["ReplicasUnavailable"]


def test_catch_all_does_not_duplicate_explained_pods() -> None:
    p = pod(containers=[container(state="running", restart_count=2, last_reason="OOMKilled")])
    findings = run_detectors(bundle(pods=[p]))
    assert [f.detector for f in findings] == ["oom"]


@pytest.mark.parametrize(
    "state",
    [
        {
            "phase": "Failed",
            "reason": "Evicted",
            "message": "The node was low on resource: memory.",
        },
        {"phase": "Unknown"},
        {"phase": "Pending"},
        {"containers": [{"state": "waiting", "reason": "RunContainerError"}]},
        {"containers": [{"state": "waiting", "reason": "CreateContainerError"}]},
        {"containers": [{"state": "terminated", "reason": "ContainerCannotRun", "exit_code": 128}]},
        {"containers": [{"state": "waiting", "reason": "SomethingNewInK8s2030"}]},
        {"containers": [{"ready": False, "state": "running"}]},
    ],
)
def test_unhealthy_pod_never_reported_healthy(state: dict[str, Any]) -> None:
    """Guard: whatever the failure, an unhealthy pod must produce an incident."""
    containers = [container(**c) for c in state.pop("containers", [{}])]
    p = pod(name="weird-pod", owner=None, labels={}, containers=containers, **state)
    assert correlate(run_detectors(bundle(pods=[p]))), f"unhealthy pod dropped: {state}"
