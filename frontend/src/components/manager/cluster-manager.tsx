"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { DEFAULT_KIND, kindKey } from "@/components/manager/kinds";
import { KindSidebar } from "@/components/manager/kind-sidebar";
import { NamespacePicker } from "@/components/manager/namespace-picker";
import { ObjectPanel } from "@/components/manager/object-panel";
import { ResourceTable } from "@/components/manager/resource-table";
import { Modal } from "@/components/modal";
import { CreateFromYaml } from "@/components/manager/yaml-panel";
import { useCanEdit } from "@/hooks/use-can-edit";
import { useAllNamespaces } from "@/hooks/use-me";
import { usePreference } from "@/hooks/use-preferences";
import { api } from "@/lib/api";
import { resolveCluster, setClusterScope, useClusterPicked, useClusterScope } from "@/lib/scope";

const control =
  "h-8 rounded-lg border border-control bg-bg px-2.5 text-sm text-fg outline-none transition-colors focus:border-accent";

type Selected = { namespace: string | null; name: string };

export function ClusterManager() {
  const params = useSearchParams();
  const router = useRouter();
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const [chosen, setChosen] = useState<string | null>(() => params.get("cluster"));
  // null: not chosen yet, so the cluster's default namespace applies ("" is All namespaces).
  const [picked, setNamespace] = useState<string | null>(() => params.get("namespace"));
  const [kindId, setKindId] = useState(() => params.get("kind") ?? DEFAULT_KIND);
  const [selected, setSelected] = useState<Selected | null>(() => {
    const name = params.get("name");
    return name ? { namespace: params.get("in") || null, name } : null;
  });

  // The sidebar and the command palette link here with a new kind or object: follow the URL
  // when it changes from outside (adjusting state during render).
  const linked = `${params.get("kind") ?? ""}|${params.get("name") ?? ""}|${params.get("in") ?? ""}|${params.get("cluster") ?? ""}`;
  const [lastLinked, setLastLinked] = useState(linked);
  if (linked !== lastLinked) {
    setLastLinked(linked);
    const name = params.get("name");
    const nextKind = params.get("kind") ?? DEFAULT_KIND;
    if (nextKind !== kindId) setKindId(nextKind);
    const nextSelected = name ? { namespace: params.get("in") || null, name } : null;
    if (nextSelected?.name !== selected?.name || nextSelected?.namespace !== selected?.namespace)
      setSelected(nextSelected);
    if (params.get("cluster") && params.get("cluster") !== chosen) setChosen(params.get("cluster"));
    if (params.get("namespace") !== null && params.get("namespace") !== picked)
      setNamespace(params.get("namespace"));
  }

  // The app sidebar lists the built-in kinds; this full list (custom resources too) is opt-in
  // while it is expanded, and always there when it is collapsed to the icon rail.
  const [appSidebar] = usePreference<{ collapsed: boolean }>("sidebar", { collapsed: false });
  const [allKinds, setAllKinds] = usePreference<boolean>("manager.kinds", false);
  const showKinds = appSidebar.collapsed || allKinds;

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const scoped = useClusterScope();
  const cluster = chosen ?? resolveCluster(clusters.data, scoped);

  // A ?cluster= link puts that cluster in scope for the other products too.
  useEffect(() => {
    const linked = params.get("cluster");
    if (linked) setClusterScope(linked, false);
  }, [params]);
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
  const namespace = picked ?? clusters.data?.find((c) => c.id === cluster)?.namespace ?? "";
  const scope = allNamespaces ? namespace : namespace || (namespaces.data?.[0] ?? "");
  const kind = kinds.data?.flatMap((c) => c.kinds).find((k) => kindKey(k) === kindId) ?? null;
  const canCreate = useCanEdit(cluster ?? "", scope || null);

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

  useClusterPicked((id) => {
    setChosen(id);
    setNamespace(null);
    setSelected(null);
    sync({ cluster: id, namespace: "", selected: null });
  });

  const pickNamespace = (ns: string) => {
    setNamespace(ns);
    setSelected(null);
    sync({ namespace: ns, selected: null });
  };

  const select = (next: Selected | null) => {
    setSelected(next);
    sync({ selected: next });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 sm:px-5">
        <NamespacePicker
          value={scope}
          namespaces={namespaces.data ?? []}
          allowAll={allNamespaces}
          disabled={kind ? !kind.namespaced : false}
          onChange={pickNamespace}
        />
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
        {created && <span className="text-sm text-accent">{created}</span>}
        <span className="ml-auto hidden text-sm text-subtle sm:inline">{canCreate ? "Changes are on" : "Read-only by default"}</span>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="h-8 rounded-lg border border-control px-2.5 text-sm text-muted transition-colors hover:text-fg"
          >
            Create
          </button>
        )}
        {!appSidebar.collapsed && (
          <button
            type="button"
            onClick={() => setAllKinds(!allKinds)}
            aria-pressed={allKinds}
            className={`hidden h-8 rounded-lg border px-2.5 text-sm transition-colors md:block ${
              allKinds ? "border-accent text-fg" : "border-control text-muted hover:text-fg"
            }`}
          >
            All kinds
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {showKinds && (
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
        )}
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
                onNamespace={pickNamespace}
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
      {creating && cluster && (
        <Modal title="Create from YAML" description="Paste one Kubernetes object. KubeiQ validates it with the API server first" onClose={() => setCreating(false)} wide>
          <CreateFromYaml
            cluster={cluster}
            namespace={scope || null}
            onDone={(message) => {
              setCreating(false);
              setCreated(message);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
