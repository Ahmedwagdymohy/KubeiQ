"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Field, input, primaryButton, secondaryButton, Section } from "@/components/settings/fields";
import { ClusterRows, CONNECT_URL, SourceCard, Step } from "@/components/settings/cluster-parts";
import { GkePanel, GkeProjectCard } from "@/components/settings/gke-connect";
import { Terminal } from "@/components/ui";
import { api } from "@/lib/api";

const FLATTEN = "kubectl config view --minify --flatten --context=<context> > cluster.yaml";
/** First give kubectl access to the cluster the usual way, then create KubeiQ's own access. */
const PROVIDERS = [
  { id: "gke", label: "GKE", login: "gcloud container clusters get-credentials <cluster> --region <region> --project <project>" },
  { id: "eks", label: "EKS", login: "aws eks update-kubeconfig --name <cluster> --region <region>" },
  { id: "aks", label: "AKS", login: "az aks get-credentials --resource-group <resource-group> --name <cluster>" },
  { id: "other", label: "Other", login: null },
] as const;

/**
 * Settings › Clusters: what KubeiQ is connected to, then the two ways to add a cluster
 * (a kubeconfig, or the Google Cloud identity of the server KubeiQ runs on).
 */
export function ClustersSection() {
  const queryClient = useQueryClient();
  const about = useQuery({ queryKey: ["settings", "about"], queryFn: api.about });
  const files = useQuery({ queryKey: ["settings", "kubeconfigs"], queryFn: api.kubeconfigs });
  const gke = useQuery({ queryKey: ["settings", "gke"], queryFn: api.gke });
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const all = clusters.data ?? [];
  const failed = clusters.isError;

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
          <h2 className="text-sm font-medium">Connected</h2>
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

function AddCluster({ gkeAvailable, onAdded }: { gkeAvailable: boolean; onAdded: () => void }) {
  const [method, setMethod] = useState<"kubeconfig" | "gcp" | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Add a Cluster</h2>
      <div role="radiogroup" aria-label="How to connect" className="grid gap-3 sm:grid-cols-2">
        <Choice
          selected={method === "kubeconfig"}
          onSelect={() => setMethod("kubeconfig")}
          title="Kubeconfig"
          text="Any cluster: GKE, EKS, AKS or your own. Create read-only access with one command, or add a kubeconfig you have"
        />
        <Choice
          selected={method === "gcp"}
          onSelect={() => setMethod("gcp")}
          title="Google Cloud"
          text="Your GKE clusters, found with this server's Google identity. No key to add or store"
          badge={gkeAvailable ? "Available here" : undefined}
        />
      </div>
      {method === "kubeconfig" && <KubeconfigPanel onAdded={onAdded} onClose={() => setMethod(null)} />}
      {method === "gcp" && <GkePanel />}
    </div>
  );
}

function KubeconfigPanel({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [source, setSource] = useState<"create" | "existing">("create");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["id"]>("gke");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const chosen = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  const n = name.trim() || "<name>";
  const connect = `curl -fsSL ${CONNECT_URL} | sh -s -- --name ${n}${chosen.login ? "" : " --context <context>"} > kubeiq-${n}.yaml`;

  const add = useMutation({
    mutationFn: () => api.addKubeconfig(name.trim(), content),
    onSuccess: () => {
      setName("");
      setContent("");
      onAdded();
      onClose();
    },
  });
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setContent(await file.text());
    if (!name) setName(file.name.replace(/\.(ya?ml|conf|config)$/i, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""));
  };

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-bg p-4">
      <Step n={1} title="Name the Cluster">
        <Field label="Name" hint="How it appears in KubeiQ. Lowercase letters, numbers and dashes">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="production" maxLength={40} />
        </Field>
      </Step>

      <Step n={2} title="Get a Kubeconfig">
        <div role="radiogroup" aria-label="Kubeconfig source" className="flex flex-col gap-3">
          <Option
            selected={source === "create"}
            onSelect={() => setSource("create")}
            title="Create read-only access"
            badge="Recommended"
            text="KubeiQ gets its own service account that can read the cluster but not Secrets. Your credentials never leave your machine"
          >
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
            <Terminal commands={[...(chosen.login ? [chosen.login] : []), connect]} />
            <p className="text-[13px] text-subtle">
              Run {chosen.login ? "both" : "it"} where kubectl can reach the cluster.
              {chosen.login ? " The first gives kubectl access, the second creates KubeiQ's access." : ""}{" "}
              Add <code className="font-mono text-xs">--changes</code> to allow Cluster Manager&apos;s
              changes, or run it later with <code className="font-mono text-xs">--remove</code> to revoke
            </p>
          </Option>
          <Option
            selected={source === "existing"}
            onSelect={() => setSource("existing")}
            title="Use a kubeconfig you have"
            text="KubeiQ gets that user's access. Kubeconfigs that log in through gcloud, aws or az cannot be used"
          >
            <Terminal commands={[FLATTEN]} />
            <p className="text-[13px] text-subtle">Exports one context with its certificates inside the file</p>
          </Option>
        </div>
      </Step>

      <Step n={3} title="Add It">
        <Field label="Kubeconfig" hint="Paste the file or choose it from your computer">
          <textarea
            className={`${input} h-40 py-2 font-mono text-xs`}
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={primaryButton}
            disabled={add.isPending || !name.trim() || !content.trim()}
            onClick={() => add.mutate()}
          >
            {add.isPending ? "Adding" : "Add Cluster"}
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          {add.error && <span className="text-sm text-danger">{(add.error as Error).message}</span>}
        </div>
      </Step>
    </div>
  );
}

/** A radio option; its details open underneath while it is selected. */
function Option({
  selected,
  onSelect,
  title,
  text,
  badge,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  text: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className="flex items-start gap-3 rounded-lg px-1 py-1 text-left"
      >
        <span
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            selected ? "border-accent" : "border-control"
          }`}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            {title}
            {badge && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">{badge}</span>}
          </span>
          <span className="text-[13px] text-muted">{text}</span>
        </span>
      </button>
      {selected && <div className="flex flex-col gap-3 pl-8">{children}</div>}
    </div>
  );
}
