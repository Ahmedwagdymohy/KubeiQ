"""Event collector: recent Warning events, newest first, deduplicated per object and reason."""

from datetime import UTC, datetime, timedelta
from typing import Any

from kubernetes.client import ApiClient, CoreV1Api

from kubeiq.collectors.models import EventRecord, Scope, make_ref
from kubeiq.core.k8s import REQUEST_TIMEOUT

WINDOW = timedelta(hours=1)
MAX_EVENTS = 200


def collect(api: ApiClient, scope: Scope) -> list[EventRecord]:
    core = CoreV1Api(api)
    selector = "type=Warning"
    if scope.namespace:
        result = core.list_namespaced_event(
            scope.namespace, field_selector=selector, _request_timeout=REQUEST_TIMEOUT
        )
    else:
        result = core.list_event_for_all_namespaces(
            field_selector=selector, _request_timeout=REQUEST_TIMEOUT
        )
    return summarize(result.items, datetime.now(UTC))


def summarize(events: list[Any], now: datetime) -> list[EventRecord]:
    latest: dict[tuple[str, str], EventRecord] = {}
    for event in events:
        record = to_record(event)
        if record.last_seen and now - record.last_seen > WINDOW:
            continue
        key = (record.involved, record.reason)
        existing = latest.get(key)
        if existing is None:
            latest[key] = record
            continue
        existing.count += record.count
        if record.last_seen and (not existing.last_seen or record.last_seen > existing.last_seen):
            existing.message, existing.last_seen = record.message, record.last_seen
        if record.first_seen and (
            not existing.first_seen or record.first_seen < existing.first_seen
        ):
            existing.first_seen = record.first_seen

    ordered = sorted(
        latest.values(), key=lambda e: e.last_seen or datetime.min.replace(tzinfo=UTC), reverse=True
    )
    return ordered[:MAX_EVENTS]


def to_record(event: Any) -> EventRecord:
    obj = event.involved_object
    meta = event.metadata
    last_seen = (
        event.last_timestamp
        or event.event_time
        or (event.series and event.series.last_observed_time)
        or meta.creation_timestamp
    )
    return EventRecord(
        ref=make_ref("Event", meta.namespace, meta.name),
        type=event.type or "Warning",
        reason=event.reason or "Unknown",
        message=(event.message or "").strip(),
        involved=make_ref(obj.kind or "Unknown", obj.namespace, obj.name or ""),
        count=event.count or 1,
        first_seen=event.first_timestamp or last_seen,
        last_seen=last_seen,
    )
