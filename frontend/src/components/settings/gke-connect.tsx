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
  loading = false,
}: {
  project: GkeSettings["projects"][number];
  settings: GkeSettings;
  clusters: Cluster[];
  failed: boolean;
  loading?: boolean;
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
        <ClusterRows
          clusters={clusters}
          failed={failed}
          loading={loading}
          empty="No GKE clusters in this project"
        />
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
  const vm = identity?.vm;
  const project = projectId.trim() || "<project>";
  // A dedicated account lives in the VM's project; that is usually the clusters' project too.
  const vmProject = vm?.project_id ?? (projectId.trim() || "<vm-project>");
  const ready = Boolean(identity?.email && !identity.error);
  const defaultAccount = Boolean(identity?.email?.endsWith("-compute@developer.gserviceaccount.com"));
  const dedicated = `kubeiq@${vmProject}.iam.gserviceaccount.com`;
  // Keep a working dedicated account; otherwise the commands below set up "kubeiq".
  const email = ready && !defaultAccount ? (identity?.email ?? dedicated) : dedicated;
  const where = `${vm?.name ?? "<vm>"} --zone=${vm?.zone ?? "<zone>"} --project=${vmProject}`;
  const setup = [
    ...(identity?.email === dedicated ? [] : [`gcloud iam service-accounts create kubeiq --display-name=KubeiQ --project=${vmProject}`]),
    `gcloud compute instances stop ${where}`,
    `gcloud compute instances set-service-account ${where} --service-account=${dedicated} --scopes=cloud-platform`,
    `gcloud compute instances start ${where}`,
  ];

  return (
    <form
      className="flex flex-col gap-6 rounded-lg border border-border bg-bg p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate([...projectsOf(gke.data), { project_id: projectId.trim(), internal_ip: internalIp }], {
          onSuccess: () => setProjectId(""),
        });
      }}
    >
      <Step n={1} title="Your Project">
        <Field label="Project ID" hint="The Google Cloud project with your GKE clusters. KubeiQ finds every cluster in it, and new ones as they appear">
          <input
            className={input}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder={vm?.project_id ?? "my-prod-project"}
            spellCheck={false}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={internalIp} onChange={(e) => setInternalIp(e.target.checked)} />
          Use private endpoints (KubeiQ runs in the clusters&apos; VPC)
        </label>
      </Step>

      <Step n={2} title="Service Account">
        {identity && (
          <p className="flex items-center gap-2 text-sm">
            <Dot tone={ready && !defaultAccount ? "healthy" : "warning"} />
            {identity.email ? (
              <span>
                KubeiQ runs as <code className="font-mono text-xs">{identity.email}</code>
              </span>
            ) : (
              "This server has no Google identity"
            )}
          </p>
        )}
        {ready && !defaultAccount ? (
          <p className="text-[13px] text-muted">Nothing to do here: KubeiQ uses this account</p>
        ) : (
          <>
            <p className="text-[13px] text-muted">
              {defaultAccount
                ? "This is the VM's default account, which usually has broad access. Give KubeiQ a dedicated one that can only read clusters:"
                : !vm && !identity?.email
                  ? "KubeiQ does not seem to run on a Google Cloud VM, which this needs. Otherwise, use Kubeconfig. On a VM, give it a dedicated account:"
                  : identity?.error
                    ? `${identity.error.replace(/\.$/, "")}. Give the VM a dedicated account with the right access:`
                    : "Give the VM a dedicated account with the right access:"}
            </p>
            {!vm && !identity?.email && identity?.error && (
              <p className="text-xs text-subtle">Details: {identity.error}</p>
            )}
            <Terminal commands={setup} />
            <p className="text-[13px] text-subtle">
              Run these from Cloud Shell or your computer, not from this VM: it stops for about a
              minute, and KubeiQ starts again with it.
              {vm ? "" : " Fill in the VM that runs KubeiQ."}
            </p>
          </>
        )}
      </Step>

      <Step n={3} title="Give It Access">
        <p className="text-[13px] text-muted">
          Let the account see the project&apos;s clusters, then grant it read-only access in each
          cluster (no Secrets) from anywhere kubectl reaches it
        </p>
        <Terminal
          commands={[
            `gcloud projects add-iam-policy-binding ${project} --member=serviceAccount:${email} --role=roles/container.clusterViewer`,
            `curl -fsSL ${CONNECT_URL} | sh -s -- --google-identity ${email}`,
          ]}
        />
      </Step>

      <Step n={4} title="Find Your Clusters">
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={`${primaryButton} self-start`} disabled={save.isPending || !projectId.trim()}>
            {save.isPending ? "Finding Clusters" : "Add Project"}
          </button>
          {save.error && <span className="text-sm text-danger">{(save.error as Error).message}</span>}
        </div>
      </Step>
    </form>
  );
}
