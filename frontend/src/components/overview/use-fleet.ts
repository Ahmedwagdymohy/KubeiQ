"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import { useMe } from "@/hooks/use-me";
import { api, type Cluster, type ClusterMap } from "@/lib/api";
import { byNamespace, countBy, workloadsFromMap, type NamespaceHealth, type Workload } from "@/lib/fleet";

const REFRESH_MS = 30_000;

export type ClusterHealth = {
  cluster: Cluster;
  workloads: Workload[];
  namespaces: NamespaceHealth[];
  counts: ReturnType<typeof countBy>;
  state: "loading" | "ready" | "offline" | "error";
  error: string | null;
  updatedAt: number;
};

/** Merge the maps of the namespaces a project member may see into one. */
function merge(maps: ClusterMap[]): ClusterMap {
  const [first] = maps;
  return {
    ...first,
    nodes: maps.flatMap((m) => m.nodes),
    edges: maps.flatMap((m) => m.edges),
  };
}

/** Workload health for every cluster, from the Cluster Map API (the same detectors as the map). */
export function useFleet() {
  const me = useMe();
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const list = clusters.data ?? [];

  const scopeFor = (cluster: Cluster): (string | null)[] => {
    if (!me.data || me.data.role === "admin") return [null];
    const access = me.data.access.filter((a) => a.cluster_id === cluster.id);
    if (access.some((a) => a.namespaces === null)) return [null];
    return [...new Set(access.flatMap((a) => a.namespaces ?? []))];
  };

  const maps = useQueries({
    queries: list.map((cluster) => ({
      queryKey: ["fleet", cluster.id, scopeFor(cluster).join(",")],
      queryFn: async () => {
        const scopes = scopeFor(cluster);
        if (scopes.length === 0) return null;
        return merge(await Promise.all(scopes.map((ns) => api.map(cluster.id, ns))));
      },
      enabled: Boolean(cluster.status?.reachable) && Boolean(me.data),
      refetchInterval: REFRESH_MS,
    })),
  });

  const health: ClusterHealth[] = list.map((cluster, i) => {
    const q = maps[i];
    const workloads = q?.data ? workloadsFromMap(q.data) : [];
    const state: ClusterHealth["state"] = !cluster.status?.reachable
      ? "offline"
      : q?.error
        ? "error"
        : q?.data !== undefined
          ? "ready"
          : "loading";
    return {
      cluster,
      workloads,
      namespaces: byNamespace(workloads),
      counts: countBy(workloads),
      state,
      error: !cluster.status?.reachable
        ? (cluster.status?.error ?? "Cluster unreachable")
        : q?.error
          ? (q.error as Error).message
          : null,
      updatedAt: q?.dataUpdatedAt ?? 0,
    };
  });

  const refetch = () => {
    clusters.refetch();
    maps.forEach((m) => m.refetch());
  };

  return {
    clusters,
    health,
    loading: clusters.isPending || health.some((h) => h.state === "loading"),
    fetching: clusters.isFetching || maps.some((m) => m.isFetching),
    refetch,
  };
}
