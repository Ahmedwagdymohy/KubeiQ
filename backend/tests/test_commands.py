"""Suggested commands must be complete, runnable, and verifiable against the workload."""

from typing import Any

from kubeiq.agent.diagnosis import AgentAnswer, from_agent, from_rules
from kubeiq.collectors.models import (
    Condition,
    NodeSnapshot,
    ServiceSnapshot,
    WorkloadSnapshot,
)
from kubeiq.detectors.commands import (
    arrange,
    fitting_request,
    image_repository,
    is_fix,
    placeholder,
    raised_memory,
    verify_commands,
)
from kubeiq.detectors.correlate import correlate
from kubeiq.detectors.registry import run_detectors
from tests.test_detectors import bundle, container, event, only_incident, pod


def test_image_repository_handles_registry_ports_and_digests() -> None:
    assert image_repository("nginx:1.27") == "nginx"
    assert image_repository("registry:5000/team/app:1.2") == "registry:5000/team/app"
    assert image_repository("ghcr.io/org/app@sha256:abc") == "ghcr.io/org/app"
    assert image_repository("busybox") == "busybox"


def test_is_fix_detects_mutations_in_chains() -> None:
    assert is_fix("kubectl -n shop patch configmap x -p '{}'")
    assert is_fix("kubectl get pods && kubectl rollout restart deployment/x")
    assert not is_fix("kubectl rollout status deployment/x -n shop")
    assert not is_fix("kubectl describe pod x-7f9c-abcde -n shop")


def test_memory_and_placeholder_helpers() -> None:
    assert raised_memory("64Mi") == "256Mi"
    assert raised_memory("512Mi") == "1Gi"
    assert raised_memory("1G") == "1907Mi"
    assert raised_memory(None) is None
    assert placeholder("DATABASE_URL") == "<database-url>"


def test_fitting_request_uses_largest_schedulable_node() -> None:
    nodes = [
        NodeSnapshot(
            ref="Node/a", name="a", ready=True, allocatable={"cpu": "8", "memory": "16Gi"}
        ),
        NodeSnapshot(
            ref="Node/b", name="b", ready=True, unschedulable=True, allocatable={"cpu": "64"}
        ),
    ]
    assert fitting_request("cpu", nodes) == "4"
    assert fitting_request("memory", nodes) == "8Gi"
    assert fitting_request("cpu", []) is None


def _pull_failure(image: str, *others: Any) -> Any:
    p = pod(
        containers=[container(name="web", state="waiting", reason="ImagePullBackOff", image=image)]
    )
    b = bundle(pods=[p, *others], events=[event(p.ref, "Failed", f"{image}: not found")])
    return only_incident(b), b


def test_image_fix_reuses_an_image_already_running_in_the_cluster() -> None:
    healthy = pod(
        name="shop-1-abcde",
        app="shop",
        unhealthy=False,
        containers=[container(image="nginx:1.27-alpine", state="running", ready=True)],
    )
    incident, _ = _pull_failure("nginx:1.99.99", healthy)
    assert incident.root.commands[0] == (
        "kubectl set image deployment/payment web=nginx:1.27-alpine -n shop"
    )


def test_image_fix_keeps_repository_when_no_tag_is_known() -> None:
    incident, _ = _pull_failure("nginx:1.99.99")
    assert "web=nginx:<existing-tag>" in incident.root.commands[0]


def test_rules_diagnosis_verifies_the_workload_not_a_stale_pod() -> None:
    incident, b = _pull_failure("nginx:1.99.99")
    b.workloads.append(
        WorkloadSnapshot(
            ref="Deployment/shop/payment",
            kind="Deployment",
            name="payment",
            namespace="shop",
            desired=1,
            ready=0,
            available=0,
            updated=1,
            selector={"app": "payment"},
        )
    )
    d = from_rules(incident, b)
    assert d.commands == ["kubectl set image deployment/payment web=nginx:<existing-tag> -n shop"]
    assert d.verify == [
        "kubectl rollout status deployment/payment -n shop --timeout=120s",
        "kubectl get pods -n shop -l app=payment",
    ]
    assert not any("payment-7f9c-abcde" in c for c in d.commands + d.verify)


def test_without_a_fix_commands_are_investigation_steps() -> None:
    commands = ["kubectl describe pod x-7f9c-abcde -n shop", "kubectl get events -n shop"]
    assert arrange(commands, ["kubectl rollout status deployment/x"]) == (commands, [])


def test_service_selector_fix_is_verified_by_endpoints() -> None:
    svc = ServiceSnapshot(
        ref="Service/shop/checkout",
        name="checkout",
        namespace="shop",
        type="ClusterIP",
        selector={"app": "checkut"},
    )
    b = bundle(pods=[pod(name="checkout-7f9c-x", app="checkout", unhealthy=False)], services=[svc])
    d = from_rules(only_incident(b), b)
    assert d.commands[0].startswith("kubectl patch service checkout")
    assert d.verify == ["kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout"]


def test_pending_fix_suggests_a_request_that_fits() -> None:
    p = pod(
        phase="Pending",
        conditions=[
            Condition(
                type="PodScheduled",
                status="False",
                reason="Unschedulable",
                message="0/1 nodes are available: 1 Insufficient cpu.",
            )
        ],
        containers=[container(requests={"cpu": "64"})],
    )
    node = NodeSnapshot(ref="Node/a", name="a", ready=True, allocatable={"cpu": "8"})
    root = only_incident(bundle(pods=[p], nodes=[node])).root
    assert (
        root.commands[0]
        == "kubectl set resources deployment/payment -c app --requests=cpu=4 -n shop"
    )


def test_agent_commands_are_split_into_fix_and_verify() -> None:
    incident, b = _pull_failure("nginx:1.99.99")
    answer = AgentAnswer(
        root_cause="x",
        explanation="x",
        confidence=80,
        commands=[
            "kubectl -n shop set image deployment/payment web=nginx:1.27",
            "kubectl logs payment-7f9c-abcde -n shop",
            "kubectl -n shop get pods -l app=payment",
        ],
    )
    d = from_agent(incident, b, answer, [])
    assert d.commands == ["kubectl -n shop set image deployment/payment web=nginx:1.27"]
    assert d.verify == [
        "kubectl rollout status deployment/payment -n shop --timeout=120s",
        "kubectl -n shop get pods -l app=payment",
    ]


def test_verify_commands_per_kind() -> None:
    b = bundle()
    assert verify_commands("Job/shop/migrate", b) == [
        "kubectl wait --for=condition=complete job/migrate -n shop --timeout=120s"
    ]
    assert verify_commands("Pod/shop/debug", b) == ["kubectl get pod debug -n shop"]


def test_every_rule_fix_command_is_followed_by_a_check() -> None:
    p = pod(
        containers=[
            container(
                state="running", restart_count=4, last_reason="OOMKilled", limits={"memory": "64Mi"}
            )
        ]
    )
    b = bundle(pods=[p])
    for incident in correlate(run_detectors(b)):
        d = from_rules(incident, b)
        assert d.commands and d.verify


def test_checks_that_only_differ_in_flags_are_merged() -> None:
    _, verify = arrange(
        [
            "kubectl -n shop patch configmap x -p '{}'",
            "kubectl -n shop rollout status deployment/x --timeout=300s",
            "kubectl -n shop get pods -l app=x",
            "kubectl -n shop logs deployment/x",
        ],
        [
            "kubectl rollout status deployment/x -n shop --timeout=120s",
            "kubectl get pods -n shop -l app=x",
        ],
    )
    assert verify == [
        "kubectl rollout status deployment/x -n shop --timeout=120s",
        "kubectl get pods -n shop -l app=x",
        "kubectl -n shop logs deployment/x",
    ]
