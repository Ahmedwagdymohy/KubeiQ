"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field, input, primaryButton, secondaryButton, Section } from "@/components/settings/fields";
import { Dot, Terminal } from "@/components/ui";
import { api, type Cluster, type StoredKubeconfig } from "@/lib/api";

const FLATTEN = "kubectl config view --minify --flatten --context=<context> > cluster.yaml";

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
      <div className="flex max-w-3xl flex-col gap-4">
        {about.data && (
          <div className="flex flex-col gap-1 rounded-md border border-border px-4 py-3">
            <span className="text-sm font-medium">Server kubeconfig</span>
            <span className="text-sm text-muted">
              <code className="font-mono text-xs">{about.data.local_kubeconfig.path}</code> ·{" "}
              {about.data.local_kubeconfig.contexts} context
              {about.data.local_kubeconfig.contexts === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {files.data?.map((file) => (
          <KubeconfigCard
            key={file.id}
            file={file}
            clusters={clusters.data ?? []}
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
  removing,
  onRemove,
}: {
  file: StoredKubeconfig;
  clusters: Cluster[];
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border px-4 py-3">
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
              <Dot tone={!status ? "info" : status.reachable ? "healthy" : "critical"} />
              <span>{ctx}</span>
              <span className="text-xs text-subtle">
                {!status
                  ? "Checking"
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
        Add kubeconfig
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-surface/50 p-4">
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
          Certificates must be inside the file, not file paths. To export one context with everything
          included:
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
