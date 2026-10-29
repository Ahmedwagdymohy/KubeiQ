"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ClusterRows, connectUrl, SourceCard, Step } from "@/components/settings/cluster-parts";
import { Field, input, primaryButton, secondaryButton } from "@/components/settings/fields";
import { Dot, Terminal } from "@/components/ui";
import { api, type Cluster, type GkeProject, type GkeProjectCheck, type GkeSettings } from "@/lib/api";

const VIEWER_ROLE = "roles/container.clusterViewer";

const projectsOf = (settings: GkeSettings | undefined): GkeProject[] =>
  (settings?.projects ?? []).map(({ project_id, internal_ip }) => ({ project_id, internal_ip }));

/** The commands that give KubeiQ's Google identity read access inside one GKE cluster. */
function grantCommands(project: string, location: string, name: string, email: string): string[] {
  return [
    `gcloud container clusters get-credentials ${name} --location ${location} --project ${project}`,
    `curl -fsSL ${connectUrl()} | sh -s -- --google-identity ${email}`,
  ];
}

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
  actions,
}: {
  project: GkeSettings["projects"][number];
  settings: GkeSettings;
  clusters: Cluster[];
  failed: boolean;
  loading?: boolean;
  actions?: (cluster: Cluster) => ReactNode;
}) {
  const save = useSaveProjects();
  const email = settings.identity.email;
  // gke:<project>/<location>/<name>: a cluster KubeiQ reaches but may not read needs the binding.
  const fix = (cluster: Cluster) => {
    if (!email || cluster.status?.can_read !== false) return null;
    const [, location, name] = cluster.id.replace(/^gke:/, "").split("/");
    return grantCommands(project.project_id, location, name, email);
  };
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
        <p className="break-words text-[13px] text-warning">{project.error}</p>
      ) : (
        <ClusterRows
          clusters={clusters}
          failed={failed}
          loading={loading}
          empty="No GKE clusters in this project"
          fix={fix}
          actions={actions}
        />
      )}
    </SourceCard>
  );
}

/** Add GKE clusters with the Google identity of the server KubeiQ runs on: no key stored. */
export function GkePanel() {
  const gke = useQuery({ queryKey: ["settings", "gke"], queryFn: api.gke });
  const save = useSaveProjects();
  const identity = gke.data?.identity;
  const vm = identity?.vm;
  // The VM's project is usually the clusters' project too: start from it.
  const [typed, setTyped] = useState<string | null>(null);
  const projectId = (typed ?? vm?.project_id ?? "").trim();
  const [internalIp, setInternalIp] = useState(false);
  const check = useMutation({ mutationFn: api.checkGke });
  const result = check.data?.project_id === projectId ? check.data : undefined;

  const project = projectId || "<project>";
  const vmProject = vm?.project_id ?? (projectId || "<vm-project>");
  const ready = Boolean(identity?.email && !identity.error);
  const defaultAccount = Boolean(identity?.email?.endsWith("-compute@developer.gserviceaccount.com"));
  const dedicated = `kubeiq@${vmProject}.iam.gserviceaccount.com`;
  // Keep a working dedicated account; otherwise the commands below set up "kubeiq".
  const email = ready && !defaultAccount ? (identity?.email ?? dedicated) : dedicated;
  const where = `${vm?.name ?? "<vm>"} --zone=${vm?.zone ?? "<zone>"} --project=${vmProject}`;
  const setup = [
    ...(identity?.email === dedicated ? [] : [`gcloud iam service-accounts create kubeiq --display-name=KubeiQ --project=${vmProject}`]),
    `gcloud projects add-iam-policy-binding ${project} --member=serviceAccount:${dedicated} --role=${VIEWER_ROLE}`,
    `gcloud compute instances stop ${where}`,
    `gcloud compute instances set-service-account ${where} --service-account=${dedicated} --scopes=cloud-platform`,
    `gcloud compute instances start ${where}`,
  ];
  const body = { project_id: projectId, internal_ip: internalIp };

  return (
    <form
      className="flex flex-col gap-6 rounded-lg border border-border bg-bg p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate([...projectsOf(gke.data), body], { onSuccess: () => setTyped("") });
      }}
    >
      <Step n={1} title="Your Project">
        <Field label="Project ID" hint="The Google Cloud project with your GKE clusters. KubeiQ finds every cluster in it, and new ones as they appear">
          <input
            className={input}
            value={typed ?? vm?.project_id ?? ""}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="my-prod-project"
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
          <p className="flex items-start gap-2 text-sm">
            <span className="pt-1.5">
              <Dot tone={ready && !defaultAccount ? "healthy" : "warning"} />
            </span>
            {identity.email ? (
              <span className="min-w-0 break-words">
                KubeiQ runs as <code className="font-mono text-xs">{identity.email}</code>
              </span>
            ) : (
              <span className="min-w-0 break-words">{identity.error ?? "This server has no Google identity"}</span>
            )}
          </p>
        )}
        {ready && !defaultAccount ? (
          <p className="text-[13px] text-muted">Nothing to do here: KubeiQ uses this account</p>
        ) : (
          <>
            <p className="text-[13px] text-muted">
              {defaultAccount
                ? "This is the VM's default account, which usually has broad access. Give KubeiQ a dedicated one that can only see clusters:"
                : vm
                  ? "Give this VM a service account that can see the project's clusters:"
                  : "KubeiQ does not seem to run on a Google Cloud VM, which this needs. Otherwise, use Kubeconfig. On a VM, give it a service account:"}
            </p>
            <Terminal commands={setup} />
            <p className="text-[13px] text-subtle">
              Run these from Cloud Shell or your computer, not from this VM: it stops for about a
              minute, and KubeiQ starts again with it.
              {vm ? "" : " Fill in the VM that runs KubeiQ."}
            </p>
          </>
        )}
      </Step>

      <Step n={3} title="Check Access">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={secondaryButton}
            disabled={!projectId || check.isPending}
            onClick={() => check.mutate(body)}
          >
            {check.isPending ? "Checking" : result ? "Check Again" : "Check"}
          </button>
          {!result && !check.isPending && (
            <span className="text-[13px] text-subtle">
              Lists the project&apos;s clusters and tests that KubeiQ can read each one
            </span>
          )}
        </div>
        {check.error && <p className="text-sm text-danger">{(check.error as Error).message}</p>}
        {result && <CheckResult result={result} email={identity?.email ?? email} />}
      </Step>

      <Step n={4} title="Add the Project">
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={`${primaryButton} self-start`} disabled={save.isPending || !projectId}>
            {save.isPending ? "Adding" : "Add Project"}
          </button>
          {save.error && <span className="text-sm text-danger">{(save.error as Error).message}</span>}
        </div>
      </Step>
    </form>
  );
}

function CheckResult({ result, email }: { result: GkeProjectCheck; email: string }) {
  if (result.error)
    return (
      <div className="flex flex-col gap-2">
        <p className="break-words rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-fg">{result.error}</p>
        {result.error.includes(VIEWER_ROLE) && (
          <Terminal
            commands={[
              `gcloud projects add-iam-policy-binding ${result.project_id} --member=serviceAccount:${email} --role=${VIEWER_ROLE}`,
            ]}
          />
        )}
      </div>
    );
  if (result.clusters.length === 0)
    return <p className="text-[13px] text-muted">No GKE clusters in {result.project_id} yet. KubeiQ adds new ones as they appear</p>;
  const missing = result.clusters.filter((c) => c.reachable && c.can_read === false);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {result.clusters.map((c) => (
          <li key={`${c.location}/${c.name}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <Dot tone={!c.reachable ? "critical" : c.can_read === false ? "warning" : "healthy"} />
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-subtle">{c.location}</span>
            <span className="min-w-0 break-words text-xs text-muted">
              {!c.reachable
                ? c.error
                : c.can_read === false
                  ? "Needs read access"
                  : `Ready, Kubernetes ${c.version}`}
            </span>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-muted">
            Grant read access (no Secrets) in {missing.length === 1 ? "this cluster" : "each of these clusters"}, from
            anywhere gcloud and kubectl work, then check again:
          </p>
          {missing.map((c) => (
            <Terminal key={`${c.location}/${c.name}`} commands={grantCommands(result.project_id, c.location, c.name, email)} />
          ))}
        </div>
      )}
    </div>
  );
}
