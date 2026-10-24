"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field, input, primaryButton, secondaryButton, Section } from "@/components/settings/fields";
import { Dot, Terminal } from "@/components/ui";
import { api, type Cluster, type StoredKubeconfig } from "@/lib/api";

const FLATTEN = "kubectl config view --minify --flatten --context=<context> > cluster.yaml";
const CONNECT_URL = "https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/connect.sh";

/** First give kubectl access to the cluster the usual way, then create KubeiQ's own access. */
const PROVIDERS = [
  { id: "gke", label: "GKE", login: "gcloud container clusters get-credentials <cluster> --region <region> --project <project>" },
  { id: "eks", label: "EKS", login: "aws eks update-kubeconfig --name <cluster> --region <region>" },
  { id: "aks", label: "AKS", login: "az aks get-credentials --resource-group <resource-group> --name <cluster>" },
  { id: "other", label: "Other", login: null },
] as const;

function connectCommand(name: string, other: boolean) {
  const n = name.trim() || "<name>";
  return `curl -fsSL ${CONNECT_URL} | sh -s -- --name ${n}${other ? " --context <context>" : ""} > kubeiq-${n}.yaml`;
}

export function ClustersSection() {
  const queryClient = useQueryClient();
  const about = useQuery({ queryKey: ["settings", "about"], queryFn: api.about });
  const files = useQuery({ queryKey: ["settings", "kubeconfigs"], queryFn: api.kubeconfigs });
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["settings", "kubeconfigs"] });
    queryClient.invalidateQueries({ queryKey: ["clusters"] });
  };
  const remove = useMutation({ mutationFn: api.deleteKubeconfig, onSuccess: refresh });

  return (
    <Section
      id="clusters"
      title="Clusters"
      description="KubeiQ connects to every context in these kubeconfig files. Access is read-only by default, and uploaded files are encrypted"
    >
      <div className="flex flex-col gap-4">
        {about.data && (
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-bg px-4 py-3">
            <span className="text-sm font-medium">Server kubeconfig</span>
            <span className="text-sm text-muted">
              <code className="font-mono text-xs">{about.data.local_kubeconfig.path}</code> ·{" "}
              {about.data.local_kubeconfig.error
                ? "Not readable"
                : `${about.data.local_kubeconfig.contexts} context${about.data.local_kubeconfig.contexts === 1 ? "" : "s"}`}
            </span>
            {about.data.local_kubeconfig.error && (
              <p className="text-xs text-warning">
                {about.data.local_kubeconfig.error}. Upload the file below instead, or run the
                installer again so KubeiQ runs as the user that owns it
              </p>
            )}
          </div>
        )}

        {files.data?.map((file) => (
          <KubeconfigCard
            key={file.id}
            file={file}
            clusters={clusters.data ?? []}
            failed={clusters.isError}
            removing={remove.isPending && remove.variables === file.id}
            onRemove={() => {
              if (window.confirm(`Remove ${file.name}? KubeiQ will stop connecting to its clusters.`))
                remove.mutate(file.id);
            }}
          />
        ))}

        <AddKubeconfig onAdded={refresh} />
      </div>
    </Section>
  );
}

function KubeconfigCard({
  file,
  clusters,
  failed,
  removing,
  onRemove,
}: {
  file: StoredKubeconfig;
  clusters: Cluster[];
  failed: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{file.name}</span>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="text-sm text-subtle transition-colors hover:text-danger"
        >
          {removing ? "Removing" : "Remove"}
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {file.contexts.map((ctx) => {
          const cluster = clusters.find((c) => c.id === `upload:${file.name}/${ctx}`);
          const status = cluster?.status;
          return (
            <li key={ctx} className="flex items-center gap-2 text-sm">
              <Dot tone={!status ? (failed ? "critical" : "info") : status.reachable ? "healthy" : "critical"} />
              <span>{ctx}</span>
              <span className="text-xs text-subtle">
                {!status
                  ? failed
                    ? "Could not check this cluster"
                    : "Checking"
                  : status.reachable
                    ? `Kubernetes ${status.version}`
                    : (status.error ?? "Unreachable")}
              </span>
            </li>
          );
        })}
      </ul>
      {file.warnings.map((w) => (
        <p key={w} className="text-xs text-warning">
          {w}
        </p>
      ))}
    </div>
  );
}

function AddKubeconfig({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["id"]>("gke");
  const chosen = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  const add = useMutation({
    mutationFn: () => api.addKubeconfig(name.trim(), content),
    onSuccess: () => {
      setOpen(false);
      setName("");
      setContent("");
      onAdded();
    },
  });

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setContent(await file.text());
    if (!name) setName(file.name.replace(/\.(ya?ml|conf|config)$/i, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""));
  };

  if (!open) {
    return (
      <button type="button" className={`${secondaryButton} self-start`} onClick={() => setOpen(true)}>
        Add Cluster
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-bg p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Create Read-Only Access</span>
          <span className="text-[13px] text-subtle">
            Run these where kubectl can reach the cluster. KubeiQ gets its own read-only service
            account, never your credentials, and no access to Secrets
          </span>
        </div>
        <div role="tablist" aria-label="Where the cluster runs" className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === provider}
              onClick={() => setProvider(p.id)}
              className={`h-8 rounded-lg px-3 text-sm transition-colors ${
                p.id === provider ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Terminal
          commands={[
            ...(chosen.login ? [chosen.login] : []),
            connectCommand(name, chosen.login === null),
          ]}
        />
        {provider === "gke" && (
          <p className="text-[13px] text-subtle">
            KubeiQ runs on Google Cloud? Connect with its Google identity under Google Cloud below,
            with no key at all
          </p>
        )}
        <p className="text-[13px] text-subtle">
          Then add the file it writes here. To remove KubeiQ&apos;s access later, run the same
          command with <code className="font-mono text-xs">--remove</code>
        </p>
      </div>
      <Field label="Name" hint="Lowercase letters, numbers and dashes, e.g. production">
        <input
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="production"
          maxLength={40}
        />
      </Field>
      <Field label="Kubeconfig" hint="Paste the file or choose it from your computer">
        <textarea
          className={`${input} h-48 font-mono text-xs`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"apiVersion: v1\nkind: Config\n..."}
          spellCheck={false}
        />
      </Field>
      <input
        type="file"
        accept=".yaml,.yml,.conf,.config,text/yaml"
        onChange={(e) => readFile(e.target.files?.[0])}
        className="text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-fg"
      />
      <div className="flex flex-col gap-2">
        <p className="text-xs text-subtle">
          Or add any kubeconfig with the certificates inside the file. To export one context with
          everything included:
        </p>
        <Terminal commands={[FLATTEN]} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryButton}
          disabled={add.isPending || !name.trim() || !content.trim()}
          onClick={() => add.mutate()}
        >
          {add.isPending ? "Adding" : "Add"}
        </button>
        <button type="button" className={secondaryButton} onClick={() => setOpen(false)}>
          Cancel
        </button>
        {add.error && <span className="text-sm text-danger">{(add.error as Error).message}</span>}
      </div>
    </div>
  );
}
