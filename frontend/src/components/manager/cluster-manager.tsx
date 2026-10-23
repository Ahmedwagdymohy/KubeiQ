"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { AppHeader } from "@/components/app-header";
import { DEFAULT_KIND, kindKey } from "@/components/manager/kinds";
import { KindSidebar } from "@/components/manager/kind-sidebar";
import { ObjectPanel } from "@/components/manager/object-panel";
import { ResourceTable } from "@/components/manager/resource-table";
import { useAllNamespaces } from "@/hooks/use-me";
import { api } from "@/lib/api";

const control =
  "rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-fg outline-none focus:border-accent";

type Selected = { namespace: string | null; name: string };

export function ClusterManager() {
  const params = useSearchParams();
  const router = useRouter();
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const [chosen, setChosen] = useState<string | null>(() => params.get("cluster"));
  const [namespace, setNamespace] = useState(() => params.get("namespace") ?? "");
  const [kindId, setKindId] = useState(() => params.get("kind") ?? DEFAULT_KIND);
  const [selected, setSelected] = useState<Selected | null>(() => {
    const name = params.get("name");
    return name ? { namespace: params.get("in") || null, name } : null;
  });

  const cluster =
    chosen ?? clusters.data?.find((c) => c.is_default)?.id ?? clusters.data?.[0]?.id ?? null;
  const allNamespaces = useAllNamespaces(cluster);
  const namespaces = useQuery({
    queryKey: ["namespaces", cluster],
    queryFn: () => api.namespaces(cluster!),
    enabled: Boolean(cluster),
  });
  const kinds = useQuery({
    queryKey: ["manager", "kinds", cluster],
    queryFn: () => api.kinds(cluster!),
    enabled: Boolean(cluster),
    staleTime: 5 * 60_000,
  });
  const scope = allNamespaces ? namespace : namespace || (namespaces.data?.[0] ?? "");
  const kind = kinds.data?.flatMap((c) => c.kinds).find((k) => kindKey(k) === kindId) ?? null;

  const sync = (next: {
    cluster?: string | null;
    namespace?: string;
    kind?: string;
    selected?: Selected | null;
  }) => {
    const q = new URLSearchParams();
    const c = next.cluster !== undefined ? next.cluster : cluster;
    const ns = next.namespace ?? namespace;
    const k = next.kind ?? kindId;
    const sel = next.selected !== undefined ? next.selected : selected;
    if (c) q.set("cluster", c);
    if (ns) q.set("namespace", ns);
    if (k !== DEFAULT_KIND) q.set("kind", k);
    if (sel) {
      q.set("name", sel.name);
      if (sel.namespace) q.set("in", sel.namespace);
    }
    router.replace(`/manager?${q.toString()}`, { scroll: false });
  };

  const select = (next: Selected | null) => {
    setSelected(next);
    sync({ selected: next });
  };

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <h1 className="mr-1 whitespace-nowrap text-base font-bold tracking-tight">Cluster Manager</h1>
        <select
          aria-label="Cluster"
          value={cluster ?? ""}
          onChange={(e) => {
            setChosen(e.target.value);
            setNamespace("");
            setSelected(null);
            sync({ cluster: e.target.value, namespace: "", selected: null });
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
          disabled={kind ? !kind.namespaced : false}
          onChange={(e) => {
            setNamespace(e.target.value);
            setSelected(null);
            sync({ namespace: e.target.value, selected: null });
          }}
          className={`${control} disabled:opacity-50`}
        >
          {allNamespaces && <option value="">All namespaces</option>}
          {namespaces.data?.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
        <select
          aria-label="Kind"
          value={kindId}
          onChange={(e) => {
            setKindId(e.target.value);
            setSelected(null);
            sync({ kind: e.target.value, selected: null });
          }}
          className={`${control} md:hidden`}
        >
          {kinds.data?.map((category) => (
            <optgroup key={category.name} label={category.name}>
              {category.kinds
                .filter((k) => allNamespaces || k.namespaced)
                .map((k) => (
                  <option key={kindKey(k)} value={kindKey(k)}>
                    {k.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <span className="ml-auto hidden text-sm text-subtle sm:inline">Read-only by default</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <KindSidebar
          categories={kinds.data ?? []}
          loading={kinds.isPending && Boolean(cluster)}
          error={kinds.error?.message}
          activeKey={kindId}
          allNamespaces={allNamespaces}
          onSelect={(k) => {
            setKindId(k);
            setSelected(null);
            sync({ kind: k, selected: null });
          }}
        />
        <div className="flex min-w-0 flex-1">
          <div className={`min-w-0 flex-1 ${selected ? "hidden xl:block" : ""}`}>
            {cluster && kind && (
              <ResourceTable
                key={`${cluster}|${kindId}|${scope}`}
                cluster={cluster}
                kind={kind}
                namespace={kind.namespaced ? scope || null : null}
                selected={selected}
                onSelect={select}
              />
            )}
            {kinds.data && !kind && (
              <p className="p-6 text-sm text-muted">This cluster does not serve that kind</p>
            )}
          </div>
          {cluster && kind && selected && (
            <div className="w-full min-w-0 border-l border-border xl:w-[640px] xl:shrink-0">
              <ObjectPanel
                key={`${cluster}|${kindId}|${selected.namespace}|${selected.name}`}
                cluster={cluster}
                kind={kind}
                namespace={selected.namespace}
                name={selected.name}
                onClose={() => select(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
