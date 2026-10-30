"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { timeAgo } from "@/components/doctor/history-list";
import { PlusIcon } from "@/components/icons";
import { AddClusterDialog, EditClusterDialog, METHOD_LABEL } from "@/components/settings/cluster-dialog";
import { LabelList } from "@/components/settings/cluster-labels";
import { SourceCard } from "@/components/settings/cluster-parts";
import { ConnectPanel } from "@/components/settings/connect-panel";
import { primaryButton, secondaryButton, Section } from "@/components/settings/fields";
import { GkeProjectCard } from "@/components/settings/gke-connect";
import { Dot } from "@/components/ui";
import { api, type Cluster, type StoredKubeconfig } from "@/lib/api";

type State = { label: string; tone: "healthy" | "warning" | "critical" | "info"; reason: string | null };

function stateOf(cluster: Cluster, probe: Cluster | undefined, testing: boolean, failed: boolean): State {
  if (testing && !probe) return { label: "Testing", tone: "info", reason: null };
  const status = probe?.status;
  if (!status) return { label: failed ? "Not checked" : "Testing", tone: "info", reason: null };
  if (cluster.login || (!status.reachable && status.can_read === false))
    return { label: "No access", tone: "warning", reason: status.error };
  if (!status.reachable) return { label: "Unreachable", tone: "critical", reason: status.error };
  if (status.can_read === false) return { label: "No access", tone: "warning", reason: status.error };
  return { label: `Connected`, tone: "healthy", reason: null };
}

/**
 * Settings › Clusters: one row per cluster with its labels, how it connects and whether it works
 * (each tested on its own, so a slow cluster never holds the page), then where clusters come from.
 */
export function ClustersSection() {
  const queryClient = useQueryClient();
  const about = useQuery({ queryKey: ["settings", "about"], queryFn: api.about });
  const files = useQuery({ queryKey: ["settings", "kubeconfigs"], queryFn: api.kubeconfigs });
  const gke = useQuery({ queryKey: ["settings", "gke"], queryFn: api.gke });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  // The list without probing (fast); each row tests its cluster on its own.
  const clusters = useQuery({ queryKey: ["clusters", "connected"], queryFn: api.connectedClusters });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ cluster: Cluster; tab?: "general" | "connection" | "usage" } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const everything = clusters.data ?? [];
  const visible = everything.filter((c) => !c.hidden);
  const hidden = everything.filter((c) => c.hidden);
  const held = new Set((projects.data ?? []).flatMap((p) => p.scopes.map((s) => s.cluster_id)));

  const refresh = () => {
    for (const key of [["settings", "kubeconfigs"], ["clusters"], ["cluster-status"], ["projects"], ["plan"]])
      queryClient.invalidateQueries({ queryKey: key });
  };
  const testAll = () => queryClient.invalidateQueries({ queryKey: ["cluster-status"] });
  const hide = useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => api.hideCluster(id, hidden),
    onSuccess: refresh,
  });
  const removeFile = useMutation({ mutationFn: api.deleteKubeconfig, onSuccess: refresh });
  const removeToken = useMutation({ mutationFn: api.deleteTokenCluster, onSuccess: refresh });
  const gkeAvailable = Boolean(gke.data?.identity.email && !gke.data.identity.error);

  const fileOf = (c: Cluster): StoredKubeconfig | undefined =>
    files.data?.find((f) => c.id.startsWith(`upload:${f.name}/`));

  const remove = (c: Cluster) => {
    if (c.method === "token") {
      if (window.confirm(`Remove ${c.name}? KubeiQ forgets its address and token.`)) removeToken.mutate(c.context ?? c.name);
      return;
    }
    const file = fileOf(c);
    if (!file) return;
    const others = file.contexts.length - 1;
    const what = others > 0 ? `the kubeconfig ${file.name} and its ${others + 1} clusters` : `the kubeconfig ${file.name}`;
    if (window.confirm(`Remove ${c.name}? This removes ${what} from KubeiQ.`)) removeFile.mutate(file.id);
  };
  const error = hide.error ?? removeFile.error ?? removeToken.error;

  return (
    <Section
      id="clusters"
      title="Clusters"
      description="The clusters KubeiQ reads, how each one connects, and whether it works. Access is read-only by default"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium">
            Connected Clusters <span className="ml-1 tabular-nums text-subtle">{visible.length}</span>
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className={secondaryButton} onClick={testAll} disabled={!visible.length}>
              Test All
            </button>
            <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
              <PlusIcon width={14} height={14} />
              Add Cluster
            </button>
          </div>
        </div>

        {clusters.isPending && <p className="text-sm text-muted">Loading clusters</p>}
        {clusters.error && <p className="text-sm text-danger">{(clusters.error as Error).message}</p>}
        {clusters.data && visible.length === 0 && (
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-bg p-4">
            <div className="flex flex-col gap-1">
              <span className="font-medium">No clusters yet</span>
              <span className="text-sm text-muted">Run this command where kubectl works to connect the first one</span>
            </div>
            <ConnectPanel onConnected={refresh} onClose={() => undefined} />
          </div>
        )}
        {visible.length > 0 && (
          <ul className="flex flex-col overflow-hidden rounded-lg border border-border bg-bg">
            {visible.map((c) => (
              <ClusterRow
                key={c.id}
                cluster={c}
                inProject={held.has(c.id)}
                removable={c.method === "token" || Boolean(fileOf(c))}
                onEdit={(tab) => setEditing({ cluster: c, tab })}
                onHide={() => hide.mutate({ id: c.id, hidden: true })}
                onRemove={() => remove(c)}
              />
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-danger">{(error as Error).message}</p>}

        {hidden.length > 0 && (
          <div className="flex flex-col gap-2 text-sm">
            <button
              type="button"
              onClick={() => setShowHidden(!showHidden)}
              aria-expanded={showHidden}
              className="self-start text-subtle transition-colors hover:text-fg"
            >
              {hidden.length} hidden {hidden.length === 1 ? "cluster" : "clusters"} · {showHidden ? "Close" : "Show"}
            </button>
            {showHidden && (
              <ul className="flex flex-col gap-1.5 rounded-lg border border-border bg-bg px-4 py-3">
                {hidden.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-muted">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => hide.mutate({ id: c.id, hidden: false })}
                      className="shrink-0 text-subtle transition-colors hover:text-fg"
                    >
                      Unhide
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Sources
          files={files.data ?? []}
          localError={about.data?.local_kubeconfig.error ?? null}
          localPath={about.data?.local_kubeconfig.path ?? null}
          onRemoveFile={(f) => {
            if (window.confirm(`Remove ${f.name}? KubeiQ will stop connecting to its clusters.`)) removeFile.mutate(f.id);
          }}
          gkeProjects={
            gke.data?.projects.map((project) => (
              <GkeProjectCard
                key={project.project_id}
                project={project}
                settings={gke.data}
                clusters={visible.filter((c) => c.id.startsWith(`gke:${project.project_id}/`))}
                failed={false}
              />
            )) ?? []
          }
        />
      </div>

      {adding && <AddClusterDialog gkeAvailable={gkeAvailable} onClose={() => setAdding(false)} />}
      {editing && <EditClusterDialog cluster={editing.cluster} initialTab={editing.tab} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function ClusterRow({
  cluster,
  inProject,
  removable,
  onEdit,
  onHide,
  onRemove,
}: {
  cluster: Cluster;
  inProject: boolean;
  removable: boolean;
  onEdit: (tab?: "general" | "connection" | "usage") => void;
  onHide: () => void;
  onRemove: () => void;
}) {
  const probe = useQuery({
    queryKey: ["cluster-status", cluster.id],
    queryFn: () => api.cluster(cluster.id),
    staleTime: 60_000,
    retry: false,
  });
  const state = stateOf(cluster, probe.data, probe.isFetching, probe.isError);
  const broken = state.tone === "critical" || state.tone === "warning";
  const action = "text-sm text-subtle transition-colors hover:text-fg";

  return (
    <li className="flex flex-col gap-1.5 border-t border-border px-4 py-3 first:border-t-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <Dot tone={state.tone} pulse={probe.isFetching} />
        <span className="min-w-0 truncate font-mono text-[13px] font-medium">{cluster.name}</span>
        <LabelList labels={cluster.labels} />
        {!inProject && (
          <button type="button" onClick={() => onEdit("general")} className="text-xs text-warning hover:underline">
            Not in a project
          </button>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <button type="button" className={action} onClick={() => probe.refetch()} disabled={probe.isFetching}>
            Test
          </button>
          {broken && cluster.login && (
            <button type="button" onClick={() => onEdit("connection")} className="text-sm font-medium text-accent hover:underline">
              Fix
            </button>
          )}
          <button type="button" className={action} onClick={() => onEdit()}>
            Edit
          </button>
          {removable ? (
            <button type="button" className={`${action} hover:!text-danger`} onClick={onRemove}>
              Remove
            </button>
          ) : (
            <button type="button" className={action} onClick={onHide}>
              Hide
            </button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-5 text-xs text-subtle">
        <span className={state.tone === "healthy" ? "text-healthy" : state.tone === "critical" ? "text-danger" : state.tone === "warning" ? "text-warning" : ""}>
          {state.label}
          {state.tone === "healthy" && probe.data?.status?.version ? ` · Kubernetes ${probe.data.status.version}` : ""}
        </span>
        <span>{METHOD_LABEL[cluster.method]}</span>
        <span>Namespace {cluster.namespace ?? "all"}</span>
        {cluster.added_at && <span>Added {timeAgo(cluster.added_at)}</span>}
      </div>
      {broken && state.reason && <p className="break-words pl-5 text-xs text-muted">{state.reason}</p>}
    </li>
  );
}

function Sources({
  files,
  localPath,
  localError,
  onRemoveFile,
  gkeProjects,
}: {
  files: StoredKubeconfig[];
  localPath: string | null;
  localError: string | null;
  onRemoveFile: (f: StoredKubeconfig) => void;
  gkeProjects: React.ReactNode[];
}) {
  const [open, setOpen] = useState(false);
  const count = files.length + gkeProjects.length + (localPath ? 1 : 0);
  if (!count) return null;
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="self-start text-sm text-subtle transition-colors hover:text-fg"
      >
        Where clusters come from ({count}) · {open ? "Close" : "Show"}
      </button>
      {open && (
        <div className="flex flex-col gap-3">
          {localPath && (
            <SourceCard title="Server kubeconfig" kind={localPath} mono>
              <p className={`break-words text-[13px] ${localError ? "text-warning" : "text-subtle"}`}>
                {localError
                  ? `${localError}. Add the file instead, or run the installer again so KubeiQ runs as the user that owns it`
                  : "Its contexts cannot be removed here; hide the ones KubeiQ should not use"}
              </p>
            </SourceCard>
          )}
          {files.map((file) => (
            <SourceCard key={file.id} title={file.name} kind={`Kubeconfig · ${file.contexts.length} ${file.contexts.length === 1 ? "context" : "contexts"}`} onRemove={() => onRemoveFile(file)}>
              {file.warnings.map((w) => (
                <p key={w} className="break-words text-xs text-warning">
                  {w}
                </p>
              ))}
            </SourceCard>
          ))}
          {gkeProjects}
        </div>
      )}
    </div>
  );
}
