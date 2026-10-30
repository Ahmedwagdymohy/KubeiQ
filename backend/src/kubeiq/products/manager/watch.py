"""Live lists: watch a kind and tell the browser when it changed, in batches.

The browser refetches the list on each batch, so a crash-looping pod updates the table about
every quarter second instead of flickering on every event. Watches restart when the server ends
them or the resource version expires (410).
"""

import asyncio
import json
import threading
from collections.abc import AsyncIterator
from typing import Any

from kubernetes.client import ApiClient
from loguru import logger

from kubeiq.products.manager.kube import METADATA_LIST, lines, open_stream, request, resource_path

BATCH_SECONDS = 0.25
WATCH_SECONDS = 300
WATCH_ACCEPT = "application/json;as=PartialObjectMetadata;v=v1;g=meta.k8s.io,application/json"


def _version(api: ApiClient, path: str) -> str:
    body = request(api, "GET", path, query=[("limit", 1)], accept=METADATA_LIST)
    return str((body.get("metadata") or {}).get("resourceVersion") or "")


def _watch(api: ApiClient, path: str, emit: Any, stop: threading.Event) -> None:
    """Runs in a thread: one watch after another until stopped. ``emit(kind)`` per event."""
    version = ""
    while not stop.is_set():
        raw = None
        try:
            version = version or _version(api, path)
            raw = open_stream(
                api,
                path,
                query=[
                    ("watch", "true"),
                    ("resourceVersion", version),
                    ("allowWatchBookmarks", "true"),
                    ("timeoutSeconds", WATCH_SECONDS),
                ],
                accept=WATCH_ACCEPT,
            )
            for line in lines(raw):
                if stop.is_set():
                    break
                event = json.loads(line)
                kind = event.get("type")
                obj = event.get("object") or {}
                if kind == "ERROR":
                    version = ""  # usually 410 Gone: list again for a fresh version
                    break
                version = (obj.get("metadata") or {}).get("resourceVersion") or version
                if kind in ("ADDED", "MODIFIED", "DELETED"):
                    emit(kind)
        except Exception as exc:
            logger.debug("Watch on {} ended: {}", path, exc)
            version = ""
            stop.wait(2)
        finally:
            if raw is not None:
                raw.release_conn()


async def changes(
    api: ApiClient,
    group: str,
    version: str,
    resource: str,
    namespace: str | None,
    disconnected: Any,
) -> AsyncIterator[dict[str, Any]]:
    """SSE events: "ready" once watching, then "change" batches with how many events came."""
    path = resource_path(group, version, resource, namespace)
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[str] = asyncio.Queue()
    stop = threading.Event()

    def emit(kind: str) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, kind)

    thread = threading.Thread(target=_watch, args=(api, path, emit, stop), daemon=True)
    thread.start()
    yield {"event": "ready", "data": "{}"}
    try:
        while not await disconnected():
            try:
                await asyncio.wait_for(queue.get(), timeout=5)
            except TimeoutError:
                continue
            await asyncio.sleep(BATCH_SECONDS)
            count = 1
            while not queue.empty():
                queue.get_nowait()
                count += 1
            yield {"event": "change", "data": json.dumps({"events": count})}
    finally:
        stop.set()
