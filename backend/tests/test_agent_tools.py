from typing import Any

from kubernetes.client import (
    V1ConfigMap,
    V1Job,
    V1JobSpec,
    V1JobStatus,
    V1ObjectMeta,
    V1PodTemplateSpec,
)

from kubeiq.agent.tools import AgentTools
from kubeiq.security.redaction import MASK


class FakeCore:
    def read_namespaced_config_map(self, name: str, namespace: str, **_: Any) -> V1ConfigMap:
        return V1ConfigMap(
            metadata=V1ObjectMeta(name=name, namespace=namespace),
            data={
                "config.yaml": "queue:\n  concurrency: 0\ndb_url: postgres://app:hunter2@db/x\n",
                "API_TOKEN": "plain-token-value",
            },
            binary_data={"cert.der": "AAAA"},
        )


class FakeBatch:
    def read_namespaced_job(self, name: str, namespace: str, **_: Any) -> V1Job:
        return V1Job(
            metadata=V1ObjectMeta(name=name),
            spec=V1JobSpec(template=V1PodTemplateSpec(), backoff_limit=0, completions=1),
            status=V1JobStatus(failed=1),
        )


def tools() -> AgentTools:
    t = AgentTools.__new__(AgentTools)
    t.core, t.batch = FakeCore(), FakeBatch()  # type: ignore[assignment]
    return t


def test_configmap_values_are_redacted() -> None:
    result = tools().get_configmap("shop", "worker-config")
    config = result["data"]["config.yaml"]

    assert "concurrency: 0" in config
    assert "hunter2" not in config
    assert result["data"]["API_TOKEN"] == MASK
    assert result["binary_keys"] == ["cert.der"]


def test_describe_job() -> None:
    job = tools().describe_workload("shop", "Job", "db-migrate")
    assert (job["kind"], job["failed"], job["backoff_limit"]) == ("Job", 1, 0)
