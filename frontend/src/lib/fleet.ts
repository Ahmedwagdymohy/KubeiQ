import type { ClusterMap, MapStatus } from "@/lib/api";

/** Kinds that run something. Their pods roll up into them through `investigate`. */
const WORKLOAD_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob", "Pod"]);
const RANK: Record<MapStatus, number> = { healthy: 0, warning: 1, error: 2 };

export type Workload = {
  ref: string;
  kind: string;
  namespace: string;
  name: string;
  status: MapStatus;
  reason: string | null;
};

/** One entry per workload, with the worst status and first problem of anything it owns. */
export function workloadsFromMap(map: ClusterMap): Workload[] {
  const byRef = new Map<string, Workload>();
  for (const node of map.nodes) {
    const ref = node.investigate ?? `${node.kind}/${node.namespace ?? ""}/${node.name}`;
    const [kind, namespace, name] = ref.split("/");
    if (!WORKLOAD_KINDS.has(kind) || !namespace) continue;
    const current = byRef.get(ref) ?? {
      ref,
      kind,
      namespace,
      name,
      status: "healthy",
      reason: null,
    };
    if (RANK[node.status] > RANK[current.status]) {
      current.status = node.status;
      current.reason = node.reason;
    }
    byRef.set(ref, current);
  }
  return [...byRef.values()].sort(
    (a, b) => RANK[b.status] - RANK[a.status] || a.name.localeCompare(b.name),
  );
}

export type NamespaceHealth = { namespace: string; workloads: Workload[]; failing: number };

/** Workloads grouped by namespace, the namespaces with problems first. */
export function byNamespace(workloads: Workload[]): NamespaceHealth[] {
  const groups = new Map<string, Workload[]>();
  for (const w of workloads) groups.set(w.namespace, [...(groups.get(w.namespace) ?? []), w]);
  return [...groups.entries()]
    .map(([namespace, items]) => ({
      namespace,
      workloads: items,
      failing: items.filter((w) => w.status !== "healthy").length,
    }))
    .sort((a, b) => b.failing - a.failing || a.namespace.localeCompare(b.namespace));
}

export function countBy(workloads: Workload[]): Record<MapStatus, number> {
  const counts: Record<MapStatus, number> = { healthy: 0, warning: 0, error: 0 };
  for (const w of workloads) counts[w.status]++;
  return counts;
}

export function clusterName(id: string): string {
  return id.replace(/^[a-z]+:/, "");
}

const MANAGER_KIND: Record<string, string> = {
  Deployment: "apps/v1/deployments",
  StatefulSet: "apps/v1/statefulsets",
  DaemonSet: "apps/v1/daemonsets",
  Job: "batch/v1/jobs",
  CronJob: "batch/v1/cronjobs",
  Pod: "core/v1/pods",
};

/** Cluster Manager link that opens this workload's panel. */
export function managerHref(cluster: string, w: Workload): string {
  const q = new URLSearchParams({ cluster, namespace: w.namespace, name: w.name, in: w.namespace });
  if (MANAGER_KIND[w.kind] && w.kind !== "Pod") q.set("kind", MANAGER_KIND[w.kind]);
  return `/manager?${q.toString()}`;
}

/** Cluster Doctor link that scans the namespace and opens this workload's incident. */
export function investigateHref(cluster: string, w: Workload): string {
  const q = new URLSearchParams({ cluster, namespace: w.namespace, focus: w.ref });
  return `/doctor?${q.toString()}`;
}
