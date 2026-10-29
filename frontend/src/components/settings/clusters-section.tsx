"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ClusterRows, SourceCard } from "@/components/settings/cluster-parts";
import { ConnectPanel, FixPanel } from "@/components/settings/connect-panel";
import { Section } from "@/components/settings/fields";
import { GkePanel, GkeProjectCard } from "@/components/settings/gke-connect";
import { api, type Cluster, type Project } from "@/lib/api";

/**
 * Settings › Clusters: what KubeiQ is connected to, then the two ways to add a cluster
 * (a kubeconfig, or the Google Cloud identity of the server KubeiQ runs on).
 */
export function ClustersSection() {
  const queryClient = useQueryClient();
  const about = useQuery({ queryKey: ["settings", "about"], queryFn: api.about });
  const files = useQuery({ queryKey: ["settings", "kubeconfigs"], queryFn: api.kubeconfigs });
  const gke = useQuery({ queryKey: ["settings", "gke"], queryFn: api.gke });
  const clusters = useQuery({ queryKey: ["clusters", "all"], queryFn: api.allClusters });
  const [fixing, setFixing] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const everything = clusters.data ?? [];
  const all = everything.filter((c) => !c.hidden);
  const hidden = everything.filter((c) => c.hidden);
  const failed = clusters.isError;
  // Checking clusters can take seconds (unreachable ones time out); never show "no contexts" then.
  const loading = clusters.isPending;

  const refresh = () => {
    for (const key of [["settings", "kubeconfigs"], ["clusters"], ["projects"], ["plan"]])
      queryClient.invalidateQueries({ queryKey: key });
  };
  const remove = useMutation({ mutationFn: api.deleteKubeconfig, onSuccess: refresh });
  const hide = useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => api.hideCluster(id, hidden),
    onSuccess: refresh,
  });
  const local = about.data?.local_kubeconfig;
  const projectSwitch = (cluster: Cluster) => <ProjectSwitch cluster={cluster} />;

  return (
    <Section
      id="clusters"
      title="Clusters"
      description="The clusters KubeiQ reads. Add one with a kubeconfig, or let KubeiQ find your GKE clusters with the Google Cloud identity of its server. Access is read-only by default"
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium">Connected</h2>
            <button
              type="button"
              onClick={() => clusters.refetch()}
              disabled={clusters.isFetching}
              className="text-sm text-subtle transition-colors hover:text-fg disabled:opacity-60"
            >
              {clusters.isFetching ? "Testing" : "Test Again"}
            </button>
          </div>
          {local && (
            <SourceCard title="Server kubeconfig" kind={local.path} mono>
              {local.error ? (
                <p className="break-words text-[13px] text-warning">
                  {local.error}. Add the file below instead, or run the installer again so KubeiQ
                  runs as the user that owns it
                </p>
              ) : (
                <ClusterRows
                  clusters={all.filter((c) => c.method === "kubeconfig")}
                  failed={failed}
                  loading={loading}
                  empty={hidden.length ? "Every context here is hidden" : "No contexts in this file"}
                  actions={(cluster) => (
                    <>
                      {cluster.login ? (
                        <button
                          type="button"
                          onClick={() => setFixing(fixing === cluster.id ? null : cluster.id)}
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          {fixing === cluster.id ? "Close" : "Fix"}
                        </button>
                      ) : (
                        projectSwitch(cluster)
                      )}
                      <button
                        type="button"
                        onClick={() => hide.mutate({ id: cluster.id, hidden: true })}
                        className="text-sm text-subtle transition-colors hover:text-fg"
                      >
                        Hide
                      </button>
                    </>
                  )}
                  below={(cluster) =>
                    fixing === cluster.id ? (
                      <div className="pl-4">
                        <FixPanel
                          clusterId={cluster.id}
                          context={cluster.name}
                          onDone={() => {
                            setFixing(null);
                            refresh();
                          }}
                        />
                      </div>
                    ) : null
                  }
                />
              )}
            </SourceCard>
          )}
          {files.data?.map((file) => (
            <SourceCard
              key={file.id}
              title={file.name}
              kind="Kubeconfig"
              removing={remove.isPending && remove.variables === file.id}
              onRemove={() => {
                if (window.confirm(`Remove ${file.name}? KubeiQ will stop connecting to its clusters.`))
                  remove.mutate(file.id);
              }}
            >
              <ClusterRows
                clusters={all.filter((c) => c.id.startsWith(`upload:${file.name}/`))}
                failed={failed}
                loading={loading}
                empty="No contexts in this file"
                actions={projectSwitch}
              />
              {file.warnings.map((w) => (
                <p key={w} className="break-words text-xs text-warning">
                  {w}
                </p>
              ))}
            </SourceCard>
          ))}
          {gke.data?.projects.map((project) => (
            <GkeProjectCard
              key={project.project_id}
              project={project}
              settings={gke.data}
              clusters={all.filter((c) => c.id.startsWith(`gke:${project.project_id}/`))}
              failed={failed}
              loading={loading}
              actions={projectSwitch}
            />
          ))}
          {hidden.length > 0 && (
            <div className="flex flex-col gap-2 text-sm">
              <button
                type="button"
                onClick={() => setShowHidden(!showHidden)}
                aria-expanded={showHidden}
                className="self-start text-subtle transition-colors hover:text-fg"
              >
                {hidden.length} hidden {hidden.length === 1 ? "cluster" : "clusters"} ·{" "}
                {showHidden ? "Close" : "Show"}
              </button>
              {showHidden && (
                <ul className="flex flex-col gap-1.5 rounded-lg border border-border px-4 py-3">
                  {hidden.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-muted">{c.name}</span>
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
          {hide.error && <p className="text-sm text-danger">{(hide.error as Error).message}</p>}
        </div>

        <AddCluster gkeAvailable={Boolean(gke.data?.identity.email && !gke.data.identity.error)} onAdded={refresh} />
      </div>
    </Section>
  );
}

/**
 * Whether KubeiQ works with this cluster: lists show the clusters in projects (ADR 0012). With
 * one project (the free plan) it is a switch; with more, a link to Projects.
 */
function ProjectSwitch({ cluster }: { cluster: Cluster }) {
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const plan = useQuery({ queryKey: ["plan"], queryFn: api.plan });
  const save = useMutation({
    mutationFn: ({ project, on }: { project: Project; on: boolean }) =>
      api.updateProject(project.id, {
        name: project.name,
        description: project.description,
        members: project.members,
        scopes: on
          ? [...project.scopes, { cluster_id: cluster.id, namespaces: [] }]
          : project.scopes.filter((s) => s.cluster_id !== cluster.id),
      }),
    onSuccess: () => {
      for (const key of [["projects"], ["plan"], ["clusters"]])
        queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const list = projects.data ?? [];
  if (!projects.data) return null;
  if (list.length !== 1) {
    const count = list.filter((p) => p.scopes.some((s) => s.cluster_id === cluster.id)).length;
    return (
      <a href="#projects" className="text-xs text-subtle hover:text-fg">
        {list.length === 0 ? "Not in a project" : count ? `In ${count} of ${list.length} projects` : "Not in a project"}
      </a>
    );
  }
  const project = list[0];
  const on = project.scopes.some((s) => s.cluster_id === cluster.id);
  const full = Boolean(plan.data && plan.data.clusters.used >= plan.data.clusters.max);
  return (
    <span className="flex items-center gap-2">
      {save.error && <span className="text-xs text-danger">{(save.error as Error).message}</span>}
      <label
        className={`flex items-center gap-1.5 text-xs ${on ? "text-fg" : "text-subtle"} ${
          !on && full ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
        title={!on && full ? `The ${plan.data?.plan} plan includes ${plan.data?.clusters.max} clusters` : undefined}
      >
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-[var(--accent)]"
          checked={on}
          disabled={save.isPending || (!on && full)}
          onChange={(e) => save.mutate({ project, on: e.target.checked })}
        />
        In {project.name}
      </label>
    </span>
  );
}

function Choice({
  selected,
  onSelect,
  title,
  text,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors ${
        selected ? "border-accent bg-accent/5" : "border-border bg-bg hover:border-subtle"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {title}
        {badge && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">{badge}</span>}
      </span>
      <span className="text-[13px] text-muted">{text}</span>
    </button>
  );
}

/** The two ways to connect a cluster. `onAdded` gets the name of an added kubeconfig. */
export function AddCluster({
  gkeAvailable,
  onAdded,
  title = "Add a Cluster",
}: {
  gkeAvailable: boolean;
  onAdded: (kubeconfig?: string) => void;
  title?: string;
}) {
  const [method, setMethod] = useState<"kubeconfig" | "gcp" | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <div role="radiogroup" aria-label="How to connect" className="grid gap-3 sm:grid-cols-2">
        <Choice
          selected={method === "kubeconfig"}
          onSelect={() => setMethod("kubeconfig")}
          title="Kubeconfig"
          text="Any cluster: GKE, EKS, AKS, minikube, kind or your own. One command gives KubeiQ read-only access"
        />
        <Choice
          selected={method === "gcp"}
          onSelect={() => setMethod("gcp")}
          title="Google Cloud"
          text="Your GKE clusters, found with this server's Google identity. No key to add or store"
          badge={gkeAvailable ? "Available here" : undefined}
        />
      </div>
      {method === "kubeconfig" && <ConnectPanel onConnected={onAdded} onClose={() => setMethod(null)} />}
      {method === "gcp" && <GkePanel />}
    </div>
  );
}
