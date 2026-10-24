"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ClusterRows, CONNECT_URL, SourceCard, Step } from "@/components/settings/cluster-parts";
import { Field, input, primaryButton } from "@/components/settings/fields";
import { Dot, Terminal } from "@/components/ui";
import { api, type Cluster, type GkeProject, type GkeSettings } from "@/lib/api";

const projectsOf = (settings: GkeSettings | undefined): GkeProject[] =>
  (settings?.projects ?? []).map(({ project_id, internal_ip }) => ({ project_id, internal_ip }));

function useSaveProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.putGke,
    onSuccess: (data) => {
      queryClient.setQueryData(["settings", "gke"], data);
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
    },
  });
}

/** A Google Cloud project in the Connected list, with the GKE clusters found in it. */
export function GkeProjectCard({
  project,
  settings,
  clusters,
  failed,
}: {
  project: GkeSettings["projects"][number];
  settings: GkeSettings;
  clusters: Cluster[];
  failed: boolean;
}) {
  const save = useSaveProjects();
  return (
    <SourceCard
      title={project.project_id}
      kind={`Google Cloud project${project.internal_ip ? ", private endpoints" : ""}`}
      removing={save.isPending}
      onRemove={() => {
        if (window.confirm(`Remove ${project.project_id}? KubeiQ will stop reading its GKE clusters.`))
          save.mutate(projectsOf(settings).filter((p) => p.project_id !== project.project_id));
      }}
    >
      {project.error ? (
        <p className="text-[13px] text-warning">{project.error}</p>
      ) : (
        <ClusterRows clusters={clusters} failed={failed} empty="No GKE clusters in this project" />
      )}
    </SourceCard>
  );
}

/** Add GKE clusters with the Google identity of the server KubeiQ runs on: no key stored. */
export function GkePanel() {
  const gke = useQuery({ queryKey: ["settings", "gke"], queryFn: api.gke });
  const save = useSaveProjects();
  const [projectId, setProjectId] = useState("");
  const [internalIp, setInternalIp] = useState(false);
  const identity = gke.data?.identity;
  const email = identity?.email ?? "<service-account-email>";
  const project = projectId.trim() || "<project>";

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-bg p-4">
      {identity && (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm">
            <Dot tone={identity.error ? "warning" : "healthy"} />
            {identity.email ? (
              <span>
                KubeiQ runs as <code className="font-mono text-xs">{identity.email}</code>
              </span>
            ) : (
              "This server has no Google identity"
            )}
          </span>
          {identity.error && <p className="text-[13px] text-warning">{identity.error}</p>}
        </div>
      )}

      <Step n={1} title="Give KubeiQ Access">
        <p className="text-[13px] text-muted">
          Once per project, let KubeiQ see the clusters. Then grant it read-only access in each
          cluster (no Secrets), from anywhere kubectl reaches it
        </p>
        <Terminal
          commands={[
            `gcloud projects add-iam-policy-binding ${project} --member=serviceAccount:${email} --role=roles/container.clusterViewer`,
            `curl -fsSL ${CONNECT_URL} | sh -s -- --google-identity ${email}`,
          ]}
        />
      </Step>

      <Step n={2} title="Add Your Project">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate([...projectsOf(gke.data), { project_id: projectId.trim(), internal_ip: internalIp }], {
              onSuccess: () => setProjectId(""),
            });
          }}
        >
          <Field label="Project ID" hint="KubeiQ finds every GKE cluster in it, and new ones as they appear">
            <input
              className={input}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="my-prod-project"
              spellCheck={false}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={internalIp} onChange={(e) => setInternalIp(e.target.checked)} />
            Use private endpoints (KubeiQ runs in the clusters&apos; VPC)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={`${primaryButton} self-start`} disabled={save.isPending || !projectId.trim()}>
              {save.isPending ? "Finding Clusters" : "Add Project"}
            </button>
            {save.error && <span className="text-sm text-danger">{(save.error as Error).message}</span>}
          </div>
        </form>
      </Step>
    </div>
  );
}
