"""Resource tables: real pod reasons, container states, usage and node details."""

from typing import Any

from kubeiq.products.manager import enrich


def _pod(status: dict[str, Any], **meta: Any) -> dict[str, Any]:
    return {
        "metadata": {"name": "web-1", "namespace": "shop", **meta},
        "spec": {
            "nodeName": "n1",
            "containers": [
                {"name": "app", "resources": {"limits": {"cpu": "500m", "memory": "256Mi"}}}
            ],
        },
        "status": status,
    }


def test_pod_status_uses_the_real_reason() -> None:
    crash = _pod(
        {
            "phase": "Running",
            "containerStatuses": [
                {
                    "name": "app",
                    "ready": False,
                    "restartCount": 12,
                    "state": {"waiting": {"reason": "CrashLoopBackOff"}},
                }
            ],
        }
    )
    assert enrich.pod_status(crash) == "CrashLoopBackOff"
    assert enrich.pod_status(_pod({"phase": "Failed", "reason": "Evicted"})) == "Evicted"
    assert enrich.pod_status(_pod({"phase": "Running"}, deletionTimestamp="x")) == "Terminating"
    init = _pod(
        {
            "phase": "Pending",
            "initContainerStatuses": [
                {"name": "migrate", "state": {"terminated": {"exitCode": 3, "reason": "Error"}}}
            ],
        }
    )
    assert enrich.pod_status(init) == "Init:Error"
    assert enrich.pod_status(_pod({"phase": "Succeeded"})) == "Succeeded"


def test_tones() -> None:
    assert enrich.tone("Running") == "ok"
    assert enrich.tone("CrashLoopBackOff") == "bad"
    assert enrich.tone("OOMKilled") == "bad"
    assert enrich.tone("Pending") == "warning"
    assert enrich.tone("Completed") == "done"


def test_pod_details_carry_containers_usage_and_limits() -> None:
    pod = _pod(
        {
            "phase": "Running",
            "podIP": "10.0.0.7",
            "containerStatuses": [
                {"name": "app", "ready": True, "restartCount": 2, "state": {"running": {}}}
            ],
        },
        ownerReferences=[{"kind": "ReplicaSet", "name": "web-7d9"}],
    )
    extra = enrich.pod_extra(pod, {("shop", "web-1"): (0.25, 128 * 2**20)})
    assert extra["status"] == "Running" and extra["tone"] == "ok"
    assert extra["containers"] == [
        {"name": "app", "state": "running", "reason": None, "ready": True, "restarts": 2}
    ]
    assert extra["restarts"] == 2 and extra["ip"] == "10.0.0.7" and extra["node"] == "n1"
    assert extra["cpu"] == 0.25 and extra["cpu_limit"] == 0.5
    assert extra["memory_limit"] == 256 * 2**20
    assert extra["owner"] == "ReplicaSet/web-7d9"
    assert enrich.pod_extra(pod, {})["cpu"] is None  # no metrics-server: no number


def test_workload_and_node_details() -> None:
    deploy = {
        "spec": {
            "replicas": 3,
            "strategy": {"type": "RollingUpdate"},
            "template": {"spec": {"containers": [{"image": "nginx:1.27"}]}},
        },
        "status": {"readyReplicas": 1},
    }
    assert enrich.workload_extra(deploy) == {
        "strategy": "RollingUpdate",
        "images": ["nginx:1.27"],
        "tone": "warning",
    }
    node = {
        "metadata": {"name": "n1", "labels": {"node-role.kubernetes.io/control-plane": ""}},
        "spec": {"unschedulable": True, "taints": [{"key": "k", "effect": "NoSchedule"}]},
        "status": {
            "conditions": [{"type": "Ready", "status": "True"}],
            "allocatable": {"cpu": "4", "memory": "8Gi", "pods": "110"},
        },
    }
    extra = enrich.node_extra(node, {"n1": (1.0, 2**30)}, {"n1": 12})
    assert extra["tone"] == "warning" and extra["unschedulable"]
    assert extra["roles"] == ["control-plane"] and extra["taints"] == ["k:NoSchedule"]
    assert (extra["cpu"], extra["cpu_capacity"], extra["pods"]) == (1.0, 4.0, 12)
