"""Run collectors concurrently and assemble an EvidenceBundle.

Stage 1 (parallel): pods, events, workloads, services, nodes.
Stage 2: logs, which needs the unhealthy pods from stage 1.
A failing collector becomes a ``Gap``; the investigation continues with partial evidence.
"""

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, datetime
from typing import Any

from kubernetes.client import ApiClient
from loguru import logger

from kubeiq.clusters.errors import describe_error
from kubeiq.collectors import events, logs, nodes, pods, services, workloads
from kubeiq.collectors.models import EvidenceBundle, Gap, ProgressEvent, Scope

ProgressCallback = Callable[[ProgressEvent], Awaitable[None]]


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def _summary(name: str, items: Sequence[Any]) -> str:
    match name:
        case "pods":
            return (
                f"{_plural(len(items), 'pod')} checked, {sum(p.unhealthy for p in items)} unhealthy"
            )
        case "events":
            return f"{_plural(len(items), 'warning event')} in the last hour"
        case "workloads":
            not_ready = sum(w.ready < w.desired for w in items)
            return f"{_plural(len(items), 'workload')}, {not_ready} not fully ready"
        case "services":
            return _plural(len(items), "service")
        case "nodes":
            return f"{_plural(len(items), 'node')}, {sum(not n.ready for n in items)} not ready"
        case "logs":
            return f"{_plural(len(items), 'log excerpt')} from unhealthy containers"
    return _plural(len(items), "item")


async def collect_evidence(
    api: ApiClient, scope: Scope, on_progress: ProgressCallback | None = None
) -> EvidenceBundle:
    bundle = EvidenceBundle(scope=scope, collected_at=datetime.now(UTC))

    async def emit(step: str, status: Any, detail: str | None = None) -> None:
        if on_progress:
            await on_progress(ProgressEvent(step=step, status=status, detail=detail))

    async def run(name: str, fn: Callable[..., list[Any]], *args: Any) -> list[Any]:
        await emit(name, "started")
        try:
            items = await asyncio.to_thread(fn, *args)
        except Exception as exc:
            error = describe_error(exc)
            logger.warning("Collector {} failed for {}: {}", name, scope.cluster_id, error)
            bundle.gaps.append(Gap(collector=name, error=error))
            await emit(name, "failed", error)
            return []
        await emit(name, "completed", _summary(name, items))
        return items

    (
        bundle.pods,
        bundle.events,
        bundle.workloads,
        bundle.services,
        bundle.nodes,
    ) = await asyncio.gather(
        run("pods", pods.collect, api, scope),
        run("events", events.collect, api, scope),
        run("workloads", workloads.collect, api, scope),
        run("services", services.collect, api, scope),
        run("nodes", nodes.collect, api, scope),
    )
    bundle.logs = await run("logs", logs.collect, api, bundle.pods)
    return bundle
