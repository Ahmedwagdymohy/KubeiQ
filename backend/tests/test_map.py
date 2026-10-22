"""Cluster Map: relations (ported from Headlamp) and health from detectors."""

from kubeiq.collectors.models import (
    ContainerSnapshot,
    EnvSource,
    EnvVar,
    EventRecord,
    ServiceSnapshot,
    WorkloadSnapshot,
)
from kubeiq.detectors.correlate import correlate
from kubeiq.detectors.registry import run_detectors
from kubeiq.products.map.builder import build_map
from kubeiq.products.map.models import ClusterMap, Resource
from kubeiq.products.map.relations import build_edges
from tests.test_detectors import bundle, container, pod


def _map(b, extras=None, configmaps=None) -> ClusterMap:  # type: ignore[no-untyped-def]
    return build_map(b, extras or [], configmaps or [], correlate(run_detectors(b)))


def _edges(m: ClusterMap) -> set[tuple[str, str]]:
    return {(e.source, e.target) for e in m.edges}


def _workload() -> WorkloadSnapshot:
    return WorkloadSnapshot(
        ref="Deployment/shop/payment",
        kind="Deployment",
        name="payment",
        namespace="shop",
        desired=1,
        ready=1,
        available=1,
        updated=1,
        selector={"app": "payment"},
    )


def _replicaset() -> Resource:
    return Resource(
        kind="ReplicaSet", name="payment-7f9c", namespace="shop", owner="Deployment/payment"
    )


def test_owner_chain_service_and_config_edges() -> None:
    p = pod(
        unhealthy=False,
        volumes=["config: configMap/payment-config", "data: pvc/payment-data"],
        containers=[
            container(
                state="running",
                ready=True,
                env=[EnvVar(name="DB", source=EnvSource.SECRET, ref="db-credentials/url")],
            )
        ],
    )
    svc = ServiceSnapshot(
        ref="Service/shop/payment",
        name="payment",
        namespace="shop",
        type="ClusterIP",
        selector={"app": "payment"},
        ready_endpoints=1,
    )
    claim = Resource(kind="PersistentVolumeClaim", name="payment-data", namespace="shop")
    m = _map(
        bundle(pods=[p], workloads=[_workload()], services=[svc]),
        [_replicaset(), claim],
        ["shop/payment-config"],
    )
    pod_ref = "Pod/shop/payment-7f9c-abcde"
    assert _edges(m) == {
        (pod_ref, "ReplicaSet/shop/payment-7f9c"),
        ("ReplicaSet/shop/payment-7f9c", "Deployment/shop/payment"),
        ("Service/shop/payment", pod_ref),
        (pod_ref, "ConfigMap/shop/payment-config"),
        (pod_ref, "Secret/shop/db-credentials"),
        ("PersistentVolumeClaim/shop/payment-data", pod_ref),
    }
    assert all(n.status == "healthy" for n in m.nodes)


def test_read_write_many_claim_is_marked_shared() -> None:
    rwx = Resource(
        kind="PersistentVolumeClaim",
        name="shared",
        namespace="shop",
        access_modes=["ReadWriteMany"],
    )
    a = Resource(kind="Pod", name="a", namespace="shop", refs={"PersistentVolumeClaim": ["shared"]})
    [edge] = build_edges([rwx, a])
    assert edge.shared == "source"


def test_crashing_pod_carries_the_detector_cause_up_to_its_workload() -> None:
    crashing = ContainerSnapshot(
        name="app",
        image="shop/app:1.0",
        state="waiting",
        reason="CreateContainerConfigError",
        message="couldn't find key password in Secret shop/db-credentials",
        env=[EnvVar(name="PASSWORD", source=EnvSource.SECRET, ref="db-credentials/password")],
    )
    b = bundle(
        pods=[pod(containers=[crashing])], workloads=[_workload().model_copy(update={"ready": 0})]
    )
    m = _map(b, [_replicaset()])
    nodes = {n.id: n for n in m.nodes}
    cause = "Secret db-credentials is missing key 'password'"
    for ref in (
        "Pod/shop/payment-7f9c-abcde",
        "Deployment/shop/payment",
        "Secret/shop/db-credentials",
    ):
        assert nodes[ref].status == "error", ref
        assert nodes[ref].reason == cause
        assert nodes[ref].investigate == "Deployment/shop/payment"
    assert m.counts["error"] == 4  # pod, its ReplicaSet, the Deployment and the Secret


def test_missing_configmap_is_an_error_node() -> None:
    p = pod(unhealthy=False, volumes=["config: configMap/gone"], containers=[container(ready=True)])
    nodes = {n.id: n for n in _map(bundle(pods=[p])).nodes}
    assert nodes["ConfigMap/shop/gone"].status == "error"
    assert nodes["ConfigMap/shop/gone"].reason == "ConfigMap gone does not exist"


def test_service_without_endpoints_is_a_warning_with_investigate() -> None:
    svc = ServiceSnapshot(
        ref="Service/shop/orders",
        name="orders",
        namespace="shop",
        type="ClusterIP",
        selector={"app": "x"},
    )
    events = [
        EventRecord(
            ref="Event/shop/e", type="Warning", reason="X", message="m", involved="Pod/shop/z"
        )
    ]
    node = next(n for n in _map(bundle(services=[svc], events=events)).nodes if n.kind == "Service")
    assert node.status in {"warning", "error"}
    assert node.investigate is not None


def test_owner_in_between_inherits_cause_and_healthy_workload_stays_green() -> None:
    crashing = container(
        state="waiting",
        reason="CrashLoopBackOff",
        restart_count=3,
        last_exit_code=1,
        last_reason="Error",
    )
    b = bundle(
        pods=[pod(containers=[crashing])], workloads=[_workload().model_copy(update={"ready": 0})]
    )
    nodes = {n.id: n for n in _map(b, [_replicaset()]).nodes}
    assert nodes["ReplicaSet/shop/payment-7f9c"].status == "error"
    assert nodes["ReplicaSet/shop/payment-7f9c"].investigate == "Deployment/shop/payment"

    svc = ServiceSnapshot(
        ref="Service/shop/checkout",
        name="checkout",
        namespace="shop",
        type="ClusterIP",
        selector={"app": "checkut"},
    )
    healthy = pod(
        name="checkout-7f9c-x", app="checkout", unhealthy=False, containers=[container(ready=True)]
    )
    checkout = _workload().model_copy(
        update={
            "ref": "Deployment/shop/checkout",
            "name": "checkout",
            "selector": {"app": "checkout"},
        }
    )
    nodes = {
        n.id: n for n in _map(bundle(pods=[healthy], services=[svc], workloads=[checkout])).nodes
    }
    assert nodes["Service/shop/checkout"].status == "error"
    assert nodes["Deployment/shop/checkout"].status == "healthy"
