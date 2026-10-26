"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { Step } from "@/components/settings/cluster-parts";
import { Field, input, primaryButton, secondaryButton } from "@/components/settings/fields";
import { Dot, Spinner, Terminal } from "@/components/ui";
import { api, apiOrigin, type ConnectStatus } from "@/lib/api";

/** Where the cluster runs: clouds first give kubectl access the usual way. */
const WHERE = [
  {
    id: "gke",
    label: "GKE",
    login: "gcloud container clusters get-credentials <cluster> --location <location> --project <project>",
    values: "your GKE cluster's name, its region or zone, and the Google Cloud project ID",
    context: "",
    hint: null,
  },
  {
    id: "eks",
    label: "EKS",
    login: "aws eks update-kubeconfig --name <cluster> --region <region>",
    values: "your EKS cluster's name and its AWS region",
    context: "",
    hint: null,
  },
  {
    id: "aks",
    label: "AKS",
    login: "az aks get-credentials --resource-group <resource-group> --name <cluster>",
    values: "the Azure resource group and your AKS cluster's name",
    context: "",
    hint: null,
  },
  {
    id: "minikube",
    label: "minikube",
    login: null,
    values: null,
    context: "minikube",
    hint: "Run it on the machine where minikube runs. If KubeiQ runs there too, the command links the two",
  },
  {
    id: "kind",
    label: "kind",
    login: null,
    values: null,
    context: "",
    hint: "Run it on the machine where kind runs. Its contexts are named kind-<cluster>",
  },
  { id: "other", label: "Other", login: null, values: null, context: "", hint: null },
] as const;

/** A kubectl context or cluster name, as typed: no spaces or shell characters. */
const cleanContext = (value: string) => value.trim().replace(/[^A-Za-z0-9_.:@/-]/g, "");
const cleanName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/**
 * Connect a cluster with one command: it carries a one-time code, creates KubeiQ's read-only
 * access and hands it to KubeiQ, and this panel shows the cluster the moment it is connected.
 */
export function ConnectPanel({
  onConnected,
  onClose,
}: {
  onConnected: (kubeconfig?: string) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [where, setWhere] = useState<(typeof WHERE)[number]["id"]>("gke");
  const [options, setOptions] = useState(false);
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [changes, setChanges] = useState(false);
  const [paste, setPaste] = useState(false);
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const [projectId, setProjectId] = useState<string | null>(null);
  const project = projectId ?? projects.data?.[0]?.id ?? null;
  const chosen = WHERE.find((w) => w.id === where) ?? WHERE[0];

  // One code per panel (and project). It works once, for 15 minutes.
  const code = useQuery({
    queryKey: ["connect-code", project],
    queryFn: () => api.createConnectCode(project),
    enabled: projects.isFetched,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const status = useQuery({
    queryKey: ["connect-status", code.data?.id],
    queryFn: () => api.connectStatus(code.data!.id),
    enabled: Boolean(code.data),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "connected" || state === "expired" ? false : 2000;
    },
  });
  const connected = status.data?.state === "connected" ? status.data : null;

  useEffect(() => {
    if (!connected) return;
    for (const key of [["clusters"], ["settings", "kubeconfigs"], ["projects"], ["plan"]])
      queryClient.invalidateQueries({ queryKey: key });
  }, [connected, queryClient]);

  const ctx = cleanContext(context) || chosen.context;
  const args = [
    `--code ${code.data?.code ?? "<code>"}`,
    ...(cleanName(name) ? [`--name ${cleanName(name)}`] : []),
    ...(ctx ? [`--context ${ctx}`] : []),
    ...(changes ? ["--changes"] : []),
  ].join(" ");
  const command = `curl -fsSL ${apiOrigin()}/api/v1/connect.sh | sh -s -- ${args}`;

  if (paste) return <PasteKubeconfig onAdded={onConnected} onBack={() => setPaste(false)} />;

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-bg p-4">
      <Step n={1} title="Where Does It Run?">
        <div role="tablist" aria-label="Where the cluster runs" className="flex flex-wrap gap-1.5">
          {WHERE.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={w.id === where}
              onClick={() => setWhere(w.id)}
              className={`h-8 rounded-lg px-3 text-sm transition-colors ${
                w.id === where ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {chosen.login && (
          <>
            <Terminal commands={[chosen.login]} />
            <p className="text-[13px] text-subtle">
              This gives kubectl access to the cluster. Replace the{" "}
              <span className="text-warning">highlighted</span> values with {chosen.values}
            </p>
          </>
        )}
      </Step>

      <Step n={2} title="Run This Command">
        {code.error ? (
          <p className="text-sm text-danger">{(code.error as Error).message}</p>
        ) : (
          <Terminal commands={[command]} />
        )}
        <p className="text-[13px] text-subtle">
          {chosen.hint ??
            "Run it anywhere kubectl reaches the cluster: your laptop, Cloud Shell or this server"}
          . It gives KubeiQ read-only access (no Secrets) and connects the cluster
          {code.data?.project ? ` to project ${code.data.project}` : ""}.
        </p>

        <button
          type="button"
          onClick={() => setOptions(!options)}
          aria-expanded={options}
          className="self-start text-sm font-medium text-accent hover:underline"
        >
          {options ? "Hide options" : "Options"}
        </button>
        {options && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name in KubeiQ" hint="Defaults to the kubectl context">
              <input
                className={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={ctx || "production"}
                maxLength={40}
              />
            </Field>
            <Field
              label="kubectl context"
              hint={
                <>
                  Defaults to the current one. List them with <Code>kubectl config get-contexts</Code>
                </>
              }
            >
              <input
                className={`${input} font-mono placeholder:font-sans`}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder={chosen.context || "current context"}
                spellCheck={false}
                autoCapitalize="off"
                maxLength={120}
              />
            </Field>
            {(projects.data?.length ?? 0) > 1 && (
              <Field label="Project">
                <select
                  className={input}
                  value={project ?? ""}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  {projects.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <label className="flex items-start gap-2 text-sm text-muted sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={changes}
                onChange={(e) => setChanges(e.target.checked)}
              />
              Also allow the changes Cluster Manager offers (scale, restart), when an admin turns
              them on
            </label>
          </div>
        )}
      </Step>

      <Step n={3} title="Connected">
        <Progress
          status={status.data}
          onRenew={() => code.refetch()}
          onDone={() => {
            onConnected(connected?.cluster ?? undefined);
            onClose();
          }}
        />
      </Step>

      <p className="text-[13px] text-subtle">
        Is this machine unable to reach KubeiQ?{" "}
        <button type="button" onClick={() => setPaste(true)} className="font-medium text-accent hover:underline">
          Add a kubeconfig file instead
        </button>
      </p>
    </div>
  );
}

function Progress({
  status,
  onRenew,
  onDone,
}: {
  status: ConnectStatus | undefined;
  onRenew: () => void;
  onDone: () => void;
}) {
  if (!status) return null;
  if (status.state === "connected")
    return (
      <div className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <Dot tone="healthy" />
          <span className="font-medium">{status.cluster} is connected</span>
          {status.version && <span className="text-subtle">Kubernetes {status.version}</span>}
        </p>
        {status.note && <p className="text-[13px] text-warning">{status.note}</p>}
        <button type="button" className={`${primaryButton} self-start`} onClick={onDone}>
          Done
        </button>
      </div>
    );
  if (status.state === "expired")
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">This command expired</span>
        <button type="button" className={secondaryButton} onClick={onRenew}>
          Get a New Command
        </button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p className="flex items-center gap-2.5 text-sm text-muted">
        <Spinner />
        {status.state === "failed"
          ? "Waiting for the command to run again"
          : "Waiting for the command to run"}
      </p>
      {status.error && (
        <p className="break-words rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-fg">
          {status.error}
        </p>
      )}
    </div>
  );
}

/** For machines that cannot reach KubeiQ: create the file with connect.sh, then paste it here. */
function PasteKubeconfig({
  onAdded,
  onBack,
}: {
  onAdded: (kubeconfig?: string) => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const add = useMutation({
    mutationFn: () => api.addKubeconfig(cleanName(name), content),
    onSuccess: (file) => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "kubeconfigs"] });
      onAdded(file.name);
      onBack();
    },
  });
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setContent(await file.text());
    if (!name) setName(cleanName(file.name.replace(/\.(ya?ml|conf|config)$/i, "")));
  };
  const create = `curl -fsSL ${apiOrigin()}/api/v1/connect.sh | sh -s -- > kubeiq-cluster.yaml`;

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-bg p-4">
      <Step n={1} title="Create the File">
        <Terminal commands={[create]} />
        <p className="text-[13px] text-subtle">
          Run it where kubectl reaches the cluster, then copy <Code>kubeiq-cluster.yaml</Code> here.
          A kubeconfig you already have works too, unless it logs in through gcloud, aws or az
        </p>
      </Step>
      <Step n={2} title="Add It">
        <Field label="Name" hint="How it appears in KubeiQ. Lowercase letters, numbers and dashes">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="production" maxLength={40} />
        </Field>
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
            disabled={add.isPending || !cleanName(name) || !content.trim()}
            onClick={() => add.mutate()}
          >
            {add.isPending ? "Adding" : "Add Cluster"}
          </button>
          <button type="button" className={secondaryButton} onClick={onBack}>
            Back
          </button>
          {add.error && <span className="text-sm text-danger">{(add.error as Error).message}</span>}
        </div>
      </Step>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="whitespace-nowrap font-mono text-xs text-muted [font-variant-ligatures:none]">
      {children}
    </code>
  );
}
