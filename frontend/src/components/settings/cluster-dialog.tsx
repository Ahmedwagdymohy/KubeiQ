"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Modal, Tabs } from "@/components/modal";
import { LabelEditor } from "@/components/settings/cluster-labels";
import { connectUrl } from "@/components/settings/cluster-parts";
import { ConnectPanel, FixPanel, PasteKubeconfig } from "@/components/settings/connect-panel";
import { Field, input, primaryButton, secondaryButton, Switch } from "@/components/settings/fields";
import { GkePanel } from "@/components/settings/gke-connect";
import { Terminal } from "@/components/ui";
import {
  api,
  apiOrigin,
  type Cluster,
  type ClusterMeta,
  type ClusterProbe,
  type Project,
  type Thresholds,
  type TokenClusterInput,
} from "@/lib/api";
import { USAGE_BAR, usageTone } from "@/lib/usage";

export const METHOD_LABEL: Record<Cluster["method"], string> = {
  kubeconfig: "Server kubeconfig",
  upload: "Kubeconfig",
  gke: "Google Cloud",
  token: "Token",
  agent: "Agent",
};

const DEFAULT_META: ClusterMeta = {
  display_name: null,
  labels: [],
  namespace: null,
  metrics: true,
  cpu: { warning: 60, critical: 80 },
  memory: { warning: 60, critical: 80 },
};

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [["clusters"], ["cluster-status"], ["cluster-summary"], ["settings", "kubeconfigs"], ["projects"], ["plan"]])
      queryClient.invalidateQueries({ queryKey: key });
  };
}

type EditTab = "general" | "connection" | "usage" | "alerts";

/** Edit a cluster: General (name, labels, namespace, project), Connection, Usage thresholds. */
export function EditClusterDialog({
  cluster,
  initialTab = "general",
  onClose,
}: {
  cluster: Cluster;
  initialTab?: EditTab;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [tab, setTab] = useState<EditTab>(initialTab);
  const [meta, setMeta] = useState<ClusterMeta>(cluster.settings ?? DEFAULT_META);
  const save = useMutation({
    mutationFn: () => api.saveClusterMeta(cluster.id, meta),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const context = cluster.context ?? cluster.name;

  return (
    <Modal title={`Edit ${cluster.name}`} description={`${METHOD_LABEL[cluster.method]} · ${context}`} onClose={onClose} wide>
      <Tabs
        tabs={[
          ["general", "General"],
          ["connection", "Connection"],
          ["usage", "Usage"],
          ["alerts", "Alerts"],
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="flex flex-col gap-6 p-5">
        {tab === "general" && <GeneralTab cluster={cluster} meta={meta} onChange={setMeta} />}
        {tab === "connection" && <ConnectionTab cluster={cluster} onFixed={() => { refresh(); onClose(); }} />}
        {tab === "usage" && <UsageTab meta={meta} onChange={setMeta} />}
        {tab === "alerts" && <AlertsTab cluster={cluster} onSaved={onClose} />}
      </div>
      {tab !== "connection" && tab !== "alerts" && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-bg px-5 py-3">
          {save.error && <span className="mr-auto text-sm text-danger">{(save.error as Error).message}</span>}
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving" : "Save"}
          </button>
        </div>
      )}
    </Modal>
  );
}

function GeneralTab({ cluster, meta, onChange }: { cluster: Cluster; meta: ClusterMeta; onChange: (m: ClusterMeta) => void }) {
  const namespaces = useQuery({
    queryKey: ["namespaces", cluster.id],
    queryFn: () => api.namespaces(cluster.id),
    enabled: Boolean(cluster.status?.reachable),
    retry: false,
  });
  return (
    <>
      <Field label="Name" hint="How it appears in KubeiQ. Its context name stays the same">
        <input
          className={input}
          value={meta.display_name ?? ""}
          placeholder={cluster.context ?? cluster.name}
          maxLength={64}
          onChange={(e) => onChange({ ...meta, display_name: e.target.value || null })}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Labels</span>
        <LabelEditor value={meta.labels} onChange={(labels) => onChange({ ...meta, labels })} />
        <span className="text-[13px] text-subtle">
          Labels show in the cluster switcher and on the dashboard, and filter both. Changes on a
          cluster labelled production ask for its name to be typed
        </span>
      </div>
      <Field label="Default namespace" hint="Where Cluster Manager opens on this cluster">
        <input
          className={input}
          list={`ns-${cluster.id}`}
          value={meta.namespace ?? ""}
          placeholder="All namespaces"
          onChange={(e) => onChange({ ...meta, namespace: e.target.value || null })}
        />
        <datalist id={`ns-${cluster.id}`}>
          {namespaces.data?.map((ns) => <option key={ns} value={ns} />)}
        </datalist>
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Project</span>
        <ProjectSwitch cluster={cluster} />
      </div>
    </>
  );
}

/**
 * Whether KubeiQ works with this cluster: lists show the clusters in projects (ADR 0012). With
 * one project (the free plan) it is a switch; with more, a link to Projects.
 */
export function ProjectSwitch({ cluster }: { cluster: Cluster }) {
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
      for (const key of [["projects"], ["plan"], ["clusters"]]) queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const list = projects.data ?? [];
  if (!projects.data) return null;
  if (list.length !== 1) {
    const count = list.filter((p) => p.scopes.some((s) => s.cluster_id === cluster.id)).length;
    return (
      <a href="#projects" className="text-sm text-muted hover:text-fg">
        {list.length === 0 ? "No projects yet" : count ? `In ${count} of ${list.length} projects` : "Not in a project"} ·{" "}
        <span className="text-accent">Open Projects</span>
      </a>
    );
  }
  const project = list[0];
  const on = project.scopes.some((s) => s.cluster_id === cluster.id);
  const full = Boolean(plan.data && plan.data.clusters.used >= plan.data.clusters.max);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label
        className={`flex items-center gap-2 text-sm ${on ? "text-fg" : "text-muted"} ${
          !on && full ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
        title={!on && full ? `The ${plan.data?.plan} plan includes ${plan.data?.clusters.max} clusters` : undefined}
      >
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={on}
          disabled={save.isPending || (!on && full)}
          onChange={(e) => save.mutate({ project, on: e.target.checked })}
        />
        In {project.name}
      </label>
      {!on && <span className="text-[13px] text-subtle">KubeiQ shows only the clusters in a project</span>}
      {save.error && <span className="text-sm text-danger">{(save.error as Error).message}</span>}
    </span>
  );
}

function ConnectionTab({ cluster, onFixed }: { cluster: Cluster; onFixed: () => void }) {
  const [fixing, setFixing] = useState(false);
  const test = useMutation({ mutationFn: () => api.cluster(cluster.id) });
  const context = cluster.context ?? cluster.name;
  const file = cluster.method === "upload" ? cluster.id.slice("upload:".length).split("/")[0] : null;
  const rows: [string, ReactNode][] = [
    ["Method", METHOD_LABEL[cluster.method]],
    ...(file ? ([["File", file]] as [string, ReactNode][]) : []),
    ...(cluster.method === "gke" ? ([["Project", cluster.id.slice(4).split("/")[0]]] as [string, ReactNode][]) : []),
    ["Context", <span key="c" className="font-mono text-[13px]">{context}</span>],
    ["API server", <span key="s" className="break-all font-mono text-[13px]">{cluster.server ?? "Unknown"}</span>],
  ];
  return (
    <>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-subtle">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={secondaryButton} disabled={test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? "Testing" : "Test connection"}
        </button>
        {test.data?.status && <ProbeLine probe={test.data.status} />}
        {test.error && <span className="text-sm text-danger">{(test.error as Error).message}</span>}
      </div>
      {cluster.method === "token" && <TokenForm existing={cluster} onDone={onFixed} />}
      {(cluster.method === "upload" || cluster.method === "kubeconfig") && (
        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Reconnect</span>
            <span className="text-[13px] text-subtle">
              The stored credentials are never shown. To replace them, run the connect command for this
              context; the new connection takes this one&apos;s place in its projects
            </span>
          </div>
          {fixing ? (
            <FixPanel clusterId={cluster.id} context={context} onDone={onFixed} />
          ) : (
            <button type="button" className={`${secondaryButton} self-start`} onClick={() => setFixing(true)}>
              Replace credentials
            </button>
          )}
        </div>
      )}
      {cluster.method === "gke" && (
        <p className="border-t border-border pt-5 text-[13px] text-subtle">
          KubeiQ reaches this cluster with the Google Cloud identity of its server; nothing is stored.
          Change projects under Google Cloud below the cluster list
        </p>
      )}
    </>
  );
}

export function ProbeLine({ probe }: { probe: ClusterProbe }) {
  if (!probe.reachable) return <span className="text-sm text-danger">{probe.error ?? "Unreachable"}</span>;
  if (probe.can_read === false) return <span className="text-sm text-warning">{probe.error ?? "No read access"}</span>;
  return <span className="text-sm text-healthy">Connected · Kubernetes {probe.version}</span>;
}

/** Which channels this cluster sends to, and for which rules. Unchecked lists mean "all". */
function AlertsTab({ cluster, onSaved }: { cluster: Cluster; onSaved: () => void }) {
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: api.notifications });
  const current = useQuery({ queryKey: ["cluster-alerts", cluster.id], queryFn: () => api.clusterAlerts(cluster.id) });
  const [draft, setDraft] = useState<{ channels: string[] | null; events: string[] | null } | null>(null);
  const value = draft ?? current.data ?? { channels: null, events: null };
  const save = useMutation({ mutationFn: () => api.saveClusterAlerts(cluster.id, value), onSuccess: onSaved });
  if (!notifications.data || !current.data) return <p className="text-sm text-muted">Loading</p>;
  const { channels, rules, available } = notifications.data;
  const pick = (list: string[] | null, all: string[], id: string, on: boolean) => {
    const base = list ?? all;
    const next = on ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    return next.length === all.length ? null : next;
  };
  const enabled = available.filter((r) => rules.enabled.includes(r.id));
  return (
    <>
      {channels.length === 0 ? (
        <p className="text-sm text-muted">
          No notification channels yet. Add one in <a href="#notifications" className="text-accent hover:underline">Settings › Notifications</a>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Send to</span>
          {channels.map((c) => (
            <label key={c.id} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={value.channels === null || value.channels.includes(c.id)}
                onChange={(e) => setDraft({ ...value, channels: pick(value.channels, channels.map((x) => x.id), c.id, e.target.checked) })}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">For</span>
        {enabled.length === 0 && <p className="text-sm text-muted">No alert rules are on</p>}
        {enabled.map((r) => (
          <label key={r.id} className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={value.events === null || value.events.includes(r.id)}
              onChange={(e) => setDraft({ ...value, events: pick(value.events, enabled.map((x) => x.id), r.id, e.target.checked) })}
            />
            {r.label}
          </label>
        ))}
      </div>
      {save.error && <p className="text-sm text-danger">{(save.error as Error).message}</p>}
      <button type="button" className={`${primaryButton} self-start`} disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving" : "Save alerts"}
      </button>
    </>
  );
}

function UsageTab({ meta, onChange }: { meta: ClusterMeta; onChange: (m: ClusterMeta) => void }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Switch checked={meta.metrics} onChange={(metrics) => onChange({ ...meta, metrics })} label="Show usage from metrics-server" />
        <span className="pl-12 text-[13px] text-subtle">
          Off hides CPU and memory for this cluster. Without metrics-server KubeiQ shows no numbers, never zeros
        </span>
      </div>
      <ThresholdField label="CPU" value={meta.cpu} onChange={(cpu) => onChange({ ...meta, cpu })} />
      <ThresholdField label="Memory" value={meta.memory} onChange={(memory) => onChange({ ...meta, memory })} />
    </>
  );
}

function ThresholdField({ label, value, onChange }: { label: string; value: Thresholds; onChange: (t: Thresholds) => void }) {
  const bad = value.warning >= value.critical;
  const number = (key: keyof Thresholds) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{key === "warning" ? "Warning at" : "Critical at"}</span>
      <input
        type="number"
        min={1}
        max={100}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: Math.max(1, Math.min(100, Number(e.target.value) || 0)) })}
        className="h-8 w-16 rounded-lg border border-control bg-bg px-2 text-right text-sm tabular-nums outline-none focus:border-accent"
      />
      <span className="text-subtle">%</span>
    </label>
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-5">
        {number("warning")}
        {number("critical")}
      </div>
      <div className="flex flex-col gap-1.5" aria-hidden="true">
        <div className="flex h-2 w-full overflow-hidden rounded-full">
          <span className="bg-healthy" style={{ width: `${value.warning}%` }} />
          <span className="bg-warning" style={{ width: `${Math.max(0, value.critical - value.warning)}%` }} />
          <span className="flex-1 bg-danger" />
        </div>
        <div className="flex gap-4 text-xs text-subtle">
          {[30, 70, 90].map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${USAGE_BAR[usageTone(p, value)]}`} />
              {p}%
            </span>
          ))}
        </div>
      </div>
      {bad && <span className="text-sm text-danger">The warning level must be below the critical level</span>}
    </div>
  );
}

/** API server + ServiceAccount token. TLS is always verified, with the CA given or the system's. */
export function TokenForm({ existing, onDone }: { existing?: Cluster; onDone: () => void }) {
  const [form, setForm] = useState<TokenClusterInput>({
    name: existing?.context ?? "",
    server: existing?.server ?? "",
    token: null,
    ca: null,
  });
  const test = useMutation({ mutationFn: () => api.testTokenCluster(form) });
  const save = useMutation({
    mutationFn: () => (existing ? api.updateTokenCluster(form) : api.addTokenCluster(form)),
    onSuccess: onDone,
  });
  const origin = apiOrigin();
  const ready = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(form.name) && form.server.startsWith("https://") && (existing || form.token);

  return (
    <div className={`flex flex-col gap-4 ${existing ? "border-t border-border pt-5" : ""}`}>
      {!existing && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-subtle">
            Where kubectl works for this cluster, create KubeiQ&apos;s read-only account and print what
            to paste here (address, CA and a token valid for a year):
          </span>
          <Terminal
            commands={[
              "kubectl create namespace kubeiq --dry-run=client -o yaml | kubectl apply -f -",
              `kubectl apply -f ${origin}/api/v1/connect/rbac/kubeiq-readonly.yaml`,
              "kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'",
              "kubectl config view --raw --minify -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d",
              "kubectl create token kubeiq -n kubeiq --duration=8760h",
            ]}
          />
        </div>
      )}
      {!existing && (
        <Field label="Name" hint="Lowercase letters, numbers and dashes">
          <input
            className={input}
            value={form.name}
            maxLength={40}
            placeholder="edge-eu"
            onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })}
          />
        </Field>
      )}
      <Field label="API server" hint="The https:// address kubectl uses">
        <input
          className={`${input} font-mono text-[13px]`}
          value={form.server}
          placeholder="https://203.0.113.10:6443"
          onChange={(e) => setForm({ ...form, server: e.target.value.trim() })}
        />
      </Field>
      <Field
        label="CA certificate"
        hint={
          existing
            ? "Paste a new bundle to replace it. Empty: the system's trusted CAs"
            : "PEM. Leave empty when the API server's certificate is signed by a public CA"
        }
      >
        <textarea
          className={`${input} h-24 py-2 font-mono text-xs`}
          value={form.ca ?? ""}
          spellCheck={false}
          placeholder="-----BEGIN CERTIFICATE-----"
          onChange={(e) => setForm({ ...form, ca: e.target.value || null })}
        />
      </Field>
      <Field label="Token" hint={existing ? "Configured. Paste a new token to replace it" : "Stored encrypted, never shown again"}>
        <textarea
          className={`${input} h-20 py-2 font-mono text-xs`}
          value={form.token ?? ""}
          spellCheck={false}
          autoComplete="off"
          placeholder={existing ? "Configured" : "eyJhbGciOi..."}
          onChange={(e) => setForm({ ...form, token: e.target.value.trim() || null })}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={secondaryButton} disabled={!ready || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? "Testing" : "Test connection"}
        </button>
        <button type="button" className={primaryButton} disabled={!ready || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Testing and saving" : existing ? "Save" : "Add Cluster"}
        </button>
        {test.data && !save.error && <ProbeLine probe={test.data} />}
        {(save.error || test.error) && (
          <span className="text-sm text-danger">{((save.error ?? test.error) as Error).message}</span>
        )}
      </div>
      <p className="text-[13px] text-subtle">
        KubeiQ always verifies the API server&apos;s certificate. There is no switch to skip it; give the CA
        instead. The script that serves these commands: <span className="font-mono">{connectUrl()}</span>
      </p>
    </div>
  );
}

type Method = "command" | "kubeconfig" | "token" | "gcp" | "agent";

const METHODS: { id: Method; title: string; text: string; badge?: string; disabled?: boolean }[] = [
  { id: "command", title: "Command", text: "One command where kubectl works. KubeiQ creates read-only access and tests it", badge: "Recommended" },
  { id: "kubeconfig", title: "Kubeconfig", text: "Paste or upload a kubeconfig file, or create one with connect.sh" },
  { id: "token", title: "Token", text: "An API server address and a ServiceAccount token, with its CA" },
  { id: "gcp", title: "Google Cloud", text: "GKE clusters found with this server's Google identity. No key stored" },
  { id: "agent", title: "Agent", text: "For private clusters: an agent connects out to KubeiQ", badge: "Planned", disabled: true },
];

/** Add a cluster: choose how, then the matching flow. Every method tests before saving. */
export function AddClusterDialog({ gkeAvailable, onClose }: { gkeAvailable: boolean; onClose: () => void }) {
  const refresh = useRefresh();
  const [method, setMethod] = useState<Method>("command");
  const done = () => {
    refresh();
    onClose();
  };
  return (
    <Modal title="Add a Cluster" description="KubeiQ only reads, unless an admin turns on cluster changes" onClose={onClose} wide>
      <div className="flex flex-col gap-5 p-5">
        <div role="radiogroup" aria-label="How to connect" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              disabled={m.disabled}
              onClick={() => setMethod(m.id)}
              className={`flex flex-col gap-1 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                method === m.id ? "border-accent bg-accent/5" : "border-border hover:border-subtle"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {m.title}
                {(m.badge || (m.id === "gcp" && gkeAvailable)) && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                    {m.id === "gcp" ? "Available here" : m.badge}
                  </span>
                )}
              </span>
              <span className="text-[13px] text-muted">{m.text}</span>
            </button>
          ))}
        </div>
        {method === "command" && <ConnectPanel onConnected={done} onClose={onClose} />}
        {method === "kubeconfig" && <PasteKubeconfig onAdded={done} onBack={() => setMethod("command")} />}
        {method === "token" && <TokenForm onDone={done} />}
        {method === "gcp" && <GkePanel />}
      </div>
    </Modal>
  );
}
