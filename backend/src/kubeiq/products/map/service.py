"""Build a Cluster Map for one cluster scope."""

import asyncio

from kubernetes.client import ApiClient

from kubeiq.collectors.models import Scope
from kubeiq.collectors.runner import collect_evidence
from kubeiq.detectors.correlate import correlate
from kubeiq.detectors.registry import run_detectors
from kubeiq.products.map import collector
from kubeiq.products.map.builder import build_map
from kubeiq.products.map.models import ClusterMap


async def cluster_map(api: ApiClient, scope: Scope) -> ClusterMap:
    bundle, (extras, configmaps, gaps) = await asyncio.gather(
        collect_evidence(api, scope),
        asyncio.to_thread(collector.collect, api, scope),
    )
    incidents = correlate(run_detectors(bundle))
    return build_map(bundle, extras, configmaps, incidents, gaps)
