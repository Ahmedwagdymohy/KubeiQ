"use client";

import { useQuery } from "@tanstack/react-query";

import { input, primaryButton } from "@/components/settings/fields";
import { SectionLabel } from "@/components/ui";
import { useAllNamespaces } from "@/hooks/use-me";
import { api, type Cluster } from "@/lib/api";

type Props = {
  selected: string | null;
  namespace: string;
  running: boolean;
  onSelect: (id: string) => void;
  onNamespace: (namespace: string) => void;
  onInvestigate: (namespace: string) => void;
};

export function ClusterPanel({
  selected,
  namespace,
  running,
  onSelect,
  onNamespace,
  onInvestigate,
}: Props) {
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const namespaces = useQuery({
    queryKey: ["namespaces", selected],
    queryFn: () => api.namespaces(selected!),
    enabled: Boolean(selected),
  });
  const current = clusters.data?.find((c) => c.id === selected);
  const allNamespaces = useAllNamespaces(selected);
  // Users limited to some namespaces start with their first one instead of "All namespaces".
  const effective = allNamespaces ? namespace : namespace || (namespaces.data?.[0] ?? "");

  return (
    <aside className="flex flex-col gap-5 bg-bg p-6">
      <div className="flex items-center justify-between">
        <SectionLabel>Clusters</SectionLabel>
        <button
          type="button"
          onClick={() => clusters.refetch()}
          className="text-sm text-subtle transition-colors hover:text-accent"
        >
          Refresh
        </button>
      </div>

      {clusters.isPending && <p className="text-sm text-muted">Loading clusters</p>}
      {clusters.error && <p className="text-sm text-danger">{(clusters.error as Error).message}</p>}
      {clusters.data?.length === 0 && (
        <p className="text-sm text-muted">
          No clusters found. Add a context to your kubeconfig and refresh.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {clusters.data?.map((cluster) => (
          <li key={cluster.id}>
            <ClusterItem
              cluster={cluster}
              active={cluster.id === selected}
              onClick={() => onSelect(cluster.id)}
            />
          </li>
        ))}
      </ul>

      {current && (
        <div className="flex flex-col gap-3 border-t border-border pt-6">
          <SectionLabel>Namespace</SectionLabel>
          <select
            value={effective}
            onChange={(e) => onNamespace(e.target.value)}
            className={input}
          >
            {allNamespaces && <option value="">All namespaces</option>}
            {namespaces.data?.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onInvestigate(effective)}
            disabled={running || !current.status?.reachable}
            className={`${primaryButton} mt-2 h-10`}
          >
            {running ? "Investigating" : "Investigate Cluster"}
          </button>
          {!current.status?.reachable && (
            <p className="text-xs text-danger">{current.status?.error ?? "Cluster unreachable"}</p>
          )}
        </div>
      )}
    </aside>
  );
}

function ClusterItem({
  cluster,
  active,
  onClick,
}: {
  cluster: Cluster;
  active: boolean;
  onClick: () => void;
}) {
  const reachable = cluster.status?.reachable;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        active ? "border-control bg-surface-2" : "border-border bg-bg hover:bg-surface"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <span className={`h-1.5 w-1.5 rounded-full ${reachable ? "bg-healthy" : "bg-danger"}`} />
        <span className="truncate font-mono text-[13px]">{cluster.name}</span>
        {cluster.is_default && <span className="text-xs text-subtle">default</span>}
      </span>
      <span className="truncate text-xs text-subtle">
        {reachable ? `Kubernetes ${cluster.status?.version}` : "Offline"}
      </span>
    </button>
  );
}
