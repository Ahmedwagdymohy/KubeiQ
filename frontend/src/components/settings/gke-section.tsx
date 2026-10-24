"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field, input, primaryButton, Section } from "@/components/settings/fields";
import { Dot, Terminal } from "@/components/ui";
import { api, type GkeProject } from "@/lib/api";

const CONNECT_URL = "https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/connect.sh";

/** GKE clusters reached with the Google identity of the machine KubeiQ runs on: no keys stored. */
export function GkeSection() {
  const queryClient = useQueryClient();
  const gke = useQuery({ queryKey: ["settings", "gke"], queryFn: api.gke });
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const [projectId, setProjectId] = useState("");
  const [internalIp, setInternalIp] = useState(false);

  const save = useMutation({
    mutationFn: api.putGke,
    onSuccess: (data) => {
      queryClient.setQueryData(["settings", "gke"], data);
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      setProjectId("");
    },
  });
  const projects: GkeProject[] = (gke.data?.projects ?? []).map(({ project_id, internal_ip }) => ({
    project_id,
    internal_ip,
  }));
  const identity = gke.data?.identity;
  const email = identity?.email ?? "<service-account-email>";
  const project = projects[0]?.project_id ?? "<project>";

  return (
    <Section
      id="gke"
      title="Google Cloud"
      description="When KubeiQ runs on a Google Cloud VM, it reads the GKE clusters of your projects with the VM's own identity. No key is stored, and tokens expire within the hour"
    >
      <div className="flex flex-col gap-5">
        {identity && (
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-bg px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Dot tone={identity.error ? "warning" : "healthy"} />
              {identity.email ? (
                <>
                  Runs as <code className="font-mono text-xs">{identity.email}</code>
                </>
              ) : (
                "No Google identity"
              )}
            </span>
            {identity.error && <p className="text-[13px] text-warning">{identity.error}</p>}
          </div>
        )}

        {gke.data?.projects.map((p) => {
          const own = (clusters.data ?? []).filter((c) => c.id.startsWith(`gke:${p.project_id}/`));
          return (
            <div key={p.project_id} className="flex flex-col gap-3 rounded-lg border border-border bg-bg px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">
                  {p.project_id}
                  {p.internal_ip && <span className="ml-2 text-xs font-normal text-subtle">Private endpoints</span>}
                </span>
                <button
                  type="button"
                  disabled={save.isPending}
                  onClick={() => save.mutate(projects.filter((x) => x.project_id !== p.project_id))}
                  className="text-sm text-subtle transition-colors hover:text-danger"
                >
                  Remove
                </button>
              </div>
              {p.error && p.error === identity?.error ? (
                <p className="text-[13px] text-subtle">Waiting for a Google identity</p>
              ) : p.error ? (
                <p className="text-[13px] text-warning">{p.error}</p>
              ) : own.length === 0 ? (
                <p className="text-[13px] text-subtle">No clusters in this project</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {own.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <Dot tone={!c.status ? "info" : c.status.reachable ? "healthy" : "critical"} />
                      <span>{c.name}</span>
                      <span className="text-xs text-subtle">
                        {!c.status
                          ? clusters.isError
                            ? "Could not check this cluster"
                            : "Checking"
                          : c.status.reachable
                            ? `Kubernetes ${c.status.version}`
                            : (c.status.error ?? "Unreachable")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate([...projects, { project_id: projectId.trim(), internal_ip: internalIp }]);
          }}
        >
          <Field label="Project ID" hint="The Google Cloud project that holds your GKE clusters">
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
              {save.isPending ? "Connecting" : "Add Project"}
            </button>
            {save.error && <span className="text-sm text-danger">{(save.error as Error).message}</span>}
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Give KubeiQ Access</span>
          <p className="text-[13px] text-subtle">
            Once per project, let the VM&apos;s service account see the clusters. Then, in each
            cluster, grant it read-only access (no Secrets)
          </p>
          <Terminal
            commands={[
              `gcloud projects add-iam-policy-binding ${project} --member=serviceAccount:${email} --role=roles/container.clusterViewer`,
              `curl -fsSL ${CONNECT_URL} | sh -s -- --google-identity ${email}`,
            ]}
          />
        </div>
      </div>
    </Section>
  );
}
