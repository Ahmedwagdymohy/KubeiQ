"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ClusterRows, SourceCard } from "@/components/settings/cluster-parts";
import { ConnectPanel } from "@/components/settings/connect-panel";
import { Section } from "@/components/settings/fields";
import { GkePanel, GkeProjectCard } from "@/components/settings/gke-connect";
import { api } from "@/lib/api";

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
  const all = clusters.data ?? [];
  const failed = clusters.isError;
  // Checking clusters can take seconds (unreachable ones time out); never show "no contexts" then.
  const loading = clusters.isPending;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["settings", "kubeconfigs"] });
    queryClient.invalidateQueries({ queryKey: ["clusters"] });
  };
  const remove = useMutation({ mutationFn: api.deleteKubeconfig, onSuccess: refresh });
  const local = about.data?.local_kubeconfig;

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
                <p className="text-[13px] text-warning">
                  {local.error}. Add the file below instead, or run the installer again so KubeiQ
                  runs as the user that owns it
                </p>
              ) : (
                <ClusterRows
                  clusters={all.filter((c) => c.method === "kubeconfig")}
                  failed={failed}
                  loading={loading}
                  empty="No contexts in this file"
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
              />
              {file.warnings.map((w) => (
                <p key={w} className="text-xs text-warning">
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
            />
          ))}
        </div>

        <AddCluster gkeAvailable={Boolean(gke.data?.identity.email && !gke.data.identity.error)} onAdded={refresh} />
      </div>
    </Section>
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
