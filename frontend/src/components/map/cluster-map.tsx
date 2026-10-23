"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { DetailsPanel } from "@/components/map/details-panel";
import { MapCanvas } from "@/components/map/map-canvas";
import { MapContext } from "@/components/map/map-context";
import { Dot, Spinner } from "@/components/ui";
import { useAllNamespaces } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { collapseGraph, findGroupContaining, getMainNode, groupGraph } from "@/lib/map/graph";

const REFRESH_MS = 10_000;

const control =
  "rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-fg outline-none focus:border-accent";

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
        on ? "border-fg/60 bg-surface-2 text-fg" : "border-border text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function ClusterMapView() {
  const params = useSearchParams();
  const router = useRouter();
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const [chosen, setChosen] = useState<string | null>(() => params.get("cluster"));
  const [namespace, setNamespace] = useState(() => params.get("namespace") ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [query, setQuery] = useState("");

  const cluster =
    chosen ?? clusters.data?.find((c) => c.is_default)?.id ?? clusters.data?.[0]?.id ?? null;
  const namespaces = useQuery({
    queryKey: ["namespaces", cluster],
    queryFn: () => api.namespaces(cluster!),
    enabled: Boolean(cluster),
  });
  const allNamespaces = useAllNamespaces(cluster);
  // Users limited to some namespaces start with their first one instead of "All namespaces".
  const scope = allNamespaces ? namespace : namespace || (namespaces.data?.[0] ?? "");
  const map = useQuery({
    queryKey: ["map", cluster, scope],
    queryFn: () => api.map(cluster!, scope || null),
    enabled: Boolean(cluster) && (allNamespaces || Boolean(scope)),
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });

  const update = (next: { cluster?: string; namespace?: string }) => {
    const c = next.cluster ?? cluster ?? "";
    const ns = next.namespace ?? namespace;
    setSelectedId(null);
    router.replace(`/map?cluster=${encodeURIComponent(c)}${ns ? `&namespace=${encodeURIComponent(ns)}` : ""}`, {
      scroll: false,
    });
  };

  const grouped = useMemo(
    () => (map.data ? groupGraph(map.data.nodes, map.data.edges, { problemsOnly, query }) : null),
    [map.data, problemsOnly, query],
  );
  const graph = useMemo(
    () => (grouped ? collapseGraph(grouped, { selectedId, expandAll }) : null),
    [grouped, selectedId, expandAll],
  );
  const focusGroup = grouped && selectedId ? findGroupContaining(grouped, selectedId) : undefined;
  const focusName =
    focusGroup && focusGroup.id !== "root" ? getMainNode(focusGroup.nodes ?? [])?.resource?.name : null;

  // Layout only re-runs when what is drawn changes, not on every identical refresh.
  const layoutKey = useMemo(() => {
    if (!map.data || !graph) return "";
    const nodes = map.data.nodes.map((n) => `${n.id}:${n.status}`).join("|");
    return [nodes, map.data.edges.length, problemsOnly, query, expandAll, focusGroup?.id ?? ""].join("#");
  }, [map.data, graph, problemsOnly, query, expandAll, focusGroup?.id]);

  const selected = map.data?.nodes.find((n) => n.id === selectedId) ?? null;
  const counts = map.data?.counts;
  const problems = (counts?.error ?? 0) + (counts?.warning ?? 0);

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <h1 className="mr-1 whitespace-nowrap text-base font-bold tracking-tight">Cluster Map</h1>
        <select
          aria-label="Cluster"
          value={cluster ?? ""}
          onChange={(e) => {
            setChosen(e.target.value);
            setNamespace("");
            update({ cluster: e.target.value, namespace: "" });
          }}
          className={control}
        >
          {clusters.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Namespace"
          value={scope}
          onChange={(e) => {
            setNamespace(e.target.value);
            update({ namespace: e.target.value });
          }}
          className={control}
        >
          {allNamespaces && <option value="">All namespaces</option>}
          {namespaces.data?.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search resources"
          className={`${control} w-48`}
        />
        <Toggle on={problemsOnly} onClick={() => setProblemsOnly((v) => !v)}>
          Problems only
        </Toggle>
        <Toggle on={expandAll} onClick={() => setExpandAll((v) => !v)}>
          Expand all
        </Toggle>
        <div className="ml-auto flex items-center gap-4 text-sm text-muted">
          {counts && (
            <>
              <span className="flex items-center gap-2">
                <Dot tone={problems ? "critical" : "healthy"} />
                {problems} {problems === 1 ? "problem" : "problems"}
              </span>
              <span className="flex items-center gap-2">
                <Dot tone="healthy" />
                {counts.healthy} healthy
              </span>
            </>
          )}
          <span className="flex items-center gap-2 text-subtle">
            {map.isFetching ? <Spinner /> : <span className="h-2 w-2 rounded-full bg-accent" />}
            Live
          </span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {focusName && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="absolute left-4 top-4 z-10 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-muted shadow-lg shadow-black/10 transition-colors hover:text-fg"
            >
              ← All resources <span className="text-subtle">/</span> <span className="text-fg">{focusName}</span>
            </button>
          )}
          {map.error && (
            <p className="p-6 text-sm text-danger">{(map.error as Error).message}</p>
          )}
          {map.isPending && cluster && <p className="p-6 text-sm text-muted">Loading the map</p>}
          {graph && graph.nodes?.length === 0 && (
            <p className="p-6 text-sm text-muted">
              {problemsOnly ? "No problems here. Everything is healthy" : "No resources match"}
            </p>
          )}
          {graph && (
            <MapContext.Provider value={{ selectedId, select: setSelectedId }}>
              <MapCanvas graph={graph} layoutKey={layoutKey} />
            </MapContext.Provider>
          )}
        </div>
        {selected && map.data && (
          <div className="absolute inset-y-0 right-0 z-20 w-full max-w-[400px] shadow-2xl shadow-black/30 md:static md:shadow-none">
            <DetailsPanel
              node={selected}
              map={map.data}
              onSelect={setSelectedId}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
