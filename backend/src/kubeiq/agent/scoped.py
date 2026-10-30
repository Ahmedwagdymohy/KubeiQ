"""The cluster assistant's tools: the investigation tools plus cluster-wide views, limited to
the namespaces the user may read. Every tool is read-only; Secrets are never read."""

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from kubeiq.agent.tools import _NS, TOOL_SPECS, AgentTools, _dump, _spec
from kubeiq.collectors import events, pods
from kubeiq.core.k8s import REQUEST_TIMEOUT

_OPTIONAL_NS = {"type": "string", "description": "Namespace (optional: all you may read)"}

ASSISTANT_TOOL_SPECS: list[dict[str, Any]] = [
    *TOOL_SPECS,
    _spec("list_namespaces", "The namespaces of the cluster that you may read.", {}, []),
    _spec(
        "find_problem_pods",
        "Pods that are not ready, failing or restarting, with restart counts, reasons and when "
        "they last restarted. Use it for 'what is broken' or 'which pods restarted'.",
        {"namespace": _OPTIONAL_NS},
        [],
    ),
    _spec(
        "recent_warnings",
        "The newest Warning events, newest first. Use it for 'what happened' or 'what changed'.",
        {"namespace": _OPTIONAL_NS, "limit": {"type": "integer", "default": 30}},
        [],
    ),
    _spec(
        "list_workloads",
        "Deployments, StatefulSets and DaemonSets of a namespace with desired and ready replicas "
        "and images.",
        {"namespace": _NS},
        ["namespace"],
    ),
]
NAMESPACED = {"get_pod_logs", "describe_pod", "get_events", "describe_workload", "list_pods"}
NAMESPACED |= {"describe_service", "get_configmap", "list_workloads"}
MAX_PROBLEMS = 40


class ScopedTools:
    """Runs a tool only inside ``namespaces`` (None: the whole cluster)."""

    def __init__(self, tools: AgentTools, namespaces: set[str] | None) -> None:
        self.tools = tools
        self.namespaces = namespaces
        self._extra: dict[str, Callable[..., Any]] = {
            "list_namespaces": self.list_namespaces,
            "find_problem_pods": self.find_problem_pods,
            "recent_warnings": self.recent_warnings,
            "list_workloads": self.list_workloads,
        }

    def _allowed(self, namespace: str | None) -> bool:
        return self.namespaces is None or (namespace is not None and namespace in self.namespaces)

    async def run(self, name: str, arguments: dict[str, Any]) -> str:
        namespace = arguments.get("namespace")
        if name in NAMESPACED and not self._allowed(namespace):
            return (
                "error: you may not read that namespace. Use list_namespaces to see which you may"
            )
        if name == "describe_node" and self.namespaces is not None:
            return "error: nodes are cluster-wide, and your access covers some namespaces only"
        if name in self._extra:
            if namespace and not self._allowed(namespace):
                return "error: you may not read that namespace"
            try:
                return _dump(await asyncio.to_thread(self._extra[name], **arguments))
            except TypeError as exc:
                return f"error: invalid arguments for {name}: {exc}"
            except Exception as exc:
                return f"error: {type(exc).__name__}"
        return await self.tools.run(name, arguments)

    def _scope(self, namespace: str | None) -> list[str | None]:
        if namespace:
            return [namespace]
        if self.namespaces is None:
            return [None]
        return list(sorted(self.namespaces))

    def list_namespaces(self) -> list[str]:
        if self.namespaces is not None:
            return sorted(self.namespaces)
        items: list[Any] = self.tools.core.list_namespace(_request_timeout=REQUEST_TIMEOUT).items
        return sorted(str(ns.metadata.name) for ns in items)

    def find_problem_pods(self, namespace: str | None = None) -> list[dict[str, Any]]:
        now = datetime.now(UTC)
        found: list[dict[str, Any]] = []
        for ns in self._scope(namespace):
            items = (
                self.tools.core.list_namespaced_pod(ns, _request_timeout=REQUEST_TIMEOUT).items
                if ns
                else self.tools.core.list_pod_for_all_namespaces(
                    _request_timeout=REQUEST_TIMEOUT
                ).items
            )
            for item in items:
                snap = pods.to_snapshot(item, now)
                restarts = sum(c.restart_count for c in snap.containers)
                ready = all(c.ready for c in snap.containers if not c.init)
                if ready and restarts == 0 and snap.phase in ("Running", "Succeeded"):
                    continue
                reasons = sorted(
                    {r for c in snap.containers for r in (c.reason, c.last_reason) if r}
                )
                found.append(
                    {
                        "pod": f"{snap.namespace}/{snap.name}",
                        "phase": snap.phase,
                        "ready": ready,
                        "restarts": restarts,
                        "reasons": reasons,
                        "last_restart": max(
                            (c.last_finished_at for c in snap.containers if c.last_finished_at),
                            default=None,
                        ),
                    }
                )
        found.sort(key=lambda p: (p["ready"], -p["restarts"]))
        return found[:MAX_PROBLEMS]

    def recent_warnings(self, namespace: str | None = None, limit: int = 30) -> list[Any]:
        records: list[Any] = []
        for ns in self._scope(namespace):
            items = (
                self.tools.core.list_namespaced_event(
                    ns, field_selector="type=Warning", _request_timeout=REQUEST_TIMEOUT
                ).items
                if ns
                else self.tools.core.list_event_for_all_namespaces(
                    field_selector="type=Warning", _request_timeout=REQUEST_TIMEOUT
                ).items
            )
            records.extend(events.to_record(e) for e in items)
        records.sort(key=lambda r: r.last_seen or datetime.min.replace(tzinfo=UTC), reverse=True)
        return records[: max(1, min(int(limit), 60))]

    def list_workloads(self, namespace: str) -> list[dict[str, Any]]:
        apps = self.tools.apps
        result: list[dict[str, Any]] = []
        groups: tuple[tuple[str, list[Any]], ...] = (
            (
                "Deployment",
                apps.list_namespaced_deployment(namespace, _request_timeout=REQUEST_TIMEOUT).items,
            ),
            (
                "StatefulSet",
                apps.list_namespaced_stateful_set(
                    namespace, _request_timeout=REQUEST_TIMEOUT
                ).items,
            ),
            (
                "DaemonSet",
                apps.list_namespaced_daemon_set(namespace, _request_timeout=REQUEST_TIMEOUT).items,
            ),
        )
        for kind, items in groups:
            for w in items:
                status = w.status
                desired = getattr(w.spec, "replicas", None)
                if desired is None:
                    desired = getattr(status, "desired_number_scheduled", 0)
                ready = (
                    getattr(status, "ready_replicas", None)
                    or getattr(status, "number_ready", 0)
                    or 0
                )
                result.append(
                    {
                        "kind": kind,
                        "name": w.metadata.name,
                        "desired": desired,
                        "ready": ready,
                        "images": [c.image for c in w.spec.template.spec.containers],
                    }
                )
        return result
