"""Read-only tools the agent can call to dig deeper into a cluster.

Every tool reuses collector converters, so the agent sees the same redacted snapshots as the
detectors. No tool can modify the cluster or read Secret values.
"""

import asyncio
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from kubernetes.client import ApiClient, AppsV1Api, BatchV1Api, CoreV1Api
from kubernetes.client.exceptions import ApiException
from pydantic import BaseModel

from kubeiq.clusters.errors import describe_error
from kubeiq.collectors import events, logs, nodes, pods, services, workloads
from kubeiq.core.k8s import REQUEST_TIMEOUT
from kubeiq.security.redaction import redact, redact_env_value

MAX_OUTPUT_CHARS = 6000
MAX_CONFIG_VALUE_CHARS = 2000


def _spec(
    name: str, description: str, properties: dict[str, Any], required: list[str]
) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required},
        },
    }


_NS = {"type": "string", "description": "Kubernetes namespace"}

TOOL_SPECS: list[dict[str, Any]] = [
    _spec(
        "get_pod_logs",
        "Read recent logs of a pod container. Use previous=true for the run before the last crash.",
        {
            "namespace": _NS,
            "pod": {"type": "string"},
            "container": {"type": "string", "description": "Container name (optional)"},
            "previous": {"type": "boolean", "default": False},
        },
        ["namespace", "pod"],
    ),
    _spec(
        "describe_pod",
        "Pod status, containers, restarts, exit codes, resources, probes and env var names.",
        {"namespace": _NS, "pod": {"type": "string"}},
        ["namespace", "pod"],
    ),
    _spec(
        "get_events",
        "Recent events (including Normal) for an object, or for the whole namespace if no name.",
        {"namespace": _NS, "name": {"type": "string", "description": "Object name (optional)"}},
        ["namespace"],
    ),
    _spec(
        "describe_workload",
        "Status of a Deployment, StatefulSet, DaemonSet (replicas, rollout conditions), "
        "Job (succeeded/failed, backoff limit) or CronJob (schedule, last run).",
        {
            "namespace": _NS,
            "kind": {
                "type": "string",
                "enum": ["Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"],
            },
            "name": {"type": "string"},
        },
        ["namespace", "kind", "name"],
    ),
    _spec(
        "list_pods",
        "List pods with phase, readiness, restarts and labels. Optional label selector.",
        {"namespace": _NS, "label_selector": {"type": "string", "description": "e.g. app=web"}},
        ["namespace"],
    ),
    _spec(
        "describe_service",
        "Service selector, ports and endpoint readiness.",
        {"namespace": _NS, "name": {"type": "string"}},
        ["namespace", "name"],
    ),
    _spec(
        "get_configmap",
        "Read a ConfigMap's keys and values (secrets inside values are redacted). "
        "Use it to inspect app config files mounted into pods.",
        {"namespace": _NS, "name": {"type": "string"}},
        ["namespace", "name"],
    ),
    _spec(
        "describe_node",
        "Node readiness, pressure conditions, taints and allocatable CPU/memory.",
        {"name": {"type": "string"}},
        ["name"],
    ),
]


def _dump(value: Any) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json", exclude_defaults=True)
    elif isinstance(value, list):
        value = [
            v.model_dump(mode="json", exclude_defaults=True) if isinstance(v, BaseModel) else v
            for v in value
        ]
    text = json.dumps(value, indent=1, default=str)
    if len(text) > MAX_OUTPUT_CHARS:
        text = text[:MAX_OUTPUT_CHARS] + "\n... (truncated)"
    return text


class AgentTools:
    def __init__(self, api: ApiClient) -> None:
        self.core = CoreV1Api(api)
        self.apps = AppsV1Api(api)
        self.batch = BatchV1Api(api)
        self._handlers: dict[str, Callable[..., Any]] = {
            "get_pod_logs": self.get_pod_logs,
            "describe_pod": self.describe_pod,
            "get_events": self.get_events,
            "describe_workload": self.describe_workload,
            "list_pods": self.list_pods,
            "describe_service": self.describe_service,
            "get_configmap": self.get_configmap,
            "describe_node": self.describe_node,
        }

    async def run(self, name: str, arguments: dict[str, Any]) -> str:
        handler = self._handlers.get(name)
        if handler is None:
            return f"error: unknown tool '{name}'"
        try:
            return _dump(await asyncio.to_thread(handler, **arguments))
        except TypeError as exc:
            return f"error: invalid arguments for {name}: {exc}"
        except ApiException as exc:
            return f"error: {exc.status} {exc.reason}"
        except Exception as exc:
            return f"error: {describe_error(exc)}"

    def get_pod_logs(
        self, namespace: str, pod: str, container: str | None = None, previous: bool = False
    ) -> dict[str, Any]:
        raw = self.core.read_namespaced_pod_log(
            pod,
            namespace,
            container=container,
            previous=previous,
            tail_lines=logs.TAIL_LINES,
            limit_bytes=logs.LIMIT_BYTES,
            _request_timeout=REQUEST_TIMEOUT,
        )
        lines, truncated = logs.condense((raw or "").splitlines())
        return {"lines": lines, "truncated": truncated}

    def describe_pod(self, namespace: str, pod: str) -> Any:
        obj = self.core.read_namespaced_pod(pod, namespace, _request_timeout=REQUEST_TIMEOUT)
        return pods.to_snapshot(obj, datetime.now(UTC))

    def get_events(self, namespace: str, name: str | None = None) -> Any:
        selector = f"involvedObject.name={name}" if name else None
        result = self.core.list_namespaced_event(
            namespace, field_selector=selector, _request_timeout=REQUEST_TIMEOUT
        )
        records = sorted(
            (events.to_record(e) for e in result.items),
            key=lambda r: r.last_seen or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        )
        return records[:30]

    def describe_workload(self, namespace: str, kind: str, name: str) -> Any:
        if kind == "Job":
            return _job(
                self.batch.read_namespaced_job(name, namespace, _request_timeout=REQUEST_TIMEOUT)
            )
        if kind == "CronJob":
            return _cronjob(
                self.batch.read_namespaced_cron_job(
                    name, namespace, _request_timeout=REQUEST_TIMEOUT
                )
            )
        readers = {
            "Deployment": (self.apps.read_namespaced_deployment, workloads.from_deployment),
            "StatefulSet": (self.apps.read_namespaced_stateful_set, workloads.from_statefulset),
            "DaemonSet": (self.apps.read_namespaced_daemon_set, workloads.from_daemonset),
        }
        if kind not in readers:
            raise TypeError(f"unsupported kind {kind}")
        read, convert = readers[kind]
        return convert(read(name, namespace, _request_timeout=REQUEST_TIMEOUT))

    def list_pods(self, namespace: str, label_selector: str | None = None) -> Any:
        result = self.core.list_namespaced_pod(
            namespace, label_selector=label_selector, _request_timeout=REQUEST_TIMEOUT
        )
        now = datetime.now(UTC)
        summary = []
        for item in result.items[:50]:
            snap = pods.to_snapshot(item, now)
            summary.append(
                {
                    "name": snap.name,
                    "phase": snap.phase,
                    "ready": all(c.ready for c in snap.containers if not c.init),
                    "restarts": sum(c.restart_count for c in snap.containers),
                    "labels": snap.labels,
                }
            )
        return summary

    def describe_service(self, namespace: str, name: str) -> Any:
        svc = self.core.read_namespaced_service(name, namespace, _request_timeout=REQUEST_TIMEOUT)
        slices = (
            self._discovery()
            .list_namespaced_endpoint_slice(
                namespace,
                label_selector=f"{services.SERVICE_NAME_LABEL}={name}",
                _request_timeout=REQUEST_TIMEOUT,
            )
            .items
        )
        return services.build([svc], slices)[0]

    def get_configmap(self, namespace: str, name: str) -> dict[str, Any]:
        cm = self.core.read_namespaced_config_map(name, namespace, _request_timeout=REQUEST_TIMEOUT)
        data = {
            key: redact_env_value(key, redact(value))[:MAX_CONFIG_VALUE_CHARS]
            for key, value in (cm.data or {}).items()
        }
        return {"name": name, "data": data, "binary_keys": sorted((cm.binary_data or {}).keys())}

    def describe_node(self, name: str) -> Any:
        return nodes.to_snapshot(self.core.read_node(name, _request_timeout=REQUEST_TIMEOUT))

    def _discovery(self) -> Any:
        from kubernetes.client import DiscoveryV1Api

        return DiscoveryV1Api(self.core.api_client)


def _conditions(obj: Any) -> list[dict[str, Any]]:
    return [
        {"type": c.type, "status": c.status, "reason": c.reason, "message": c.message}
        for c in (obj.status.conditions or [])
    ]


def _job(job: Any) -> dict[str, Any]:
    status = job.status
    return {
        "kind": "Job",
        "name": job.metadata.name,
        "completions": job.spec.completions,
        "backoff_limit": job.spec.backoff_limit,
        "active": status.active or 0,
        "succeeded": status.succeeded or 0,
        "failed": status.failed or 0,
        "start_time": status.start_time,
        "completion_time": status.completion_time,
        "conditions": _conditions(job),
    }


def _cronjob(cron: Any) -> dict[str, Any]:
    status = cron.status
    return {
        "kind": "CronJob",
        "name": cron.metadata.name,
        "schedule": cron.spec.schedule,
        "suspend": bool(cron.spec.suspend),
        "concurrency_policy": cron.spec.concurrency_policy,
        "last_schedule_time": status.last_schedule_time,
        "last_successful_time": getattr(status, "last_successful_time", None),
        "active_jobs": [ref.name for ref in status.active or []],
    }
