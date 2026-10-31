"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Step } from "@/components/settings/cluster-parts";
import { Field, input, primaryButton, secondaryButton } from "@/components/settings/fields";
import { Dot, Spinner, Terminal } from "@/components/ui";
import { api, apiOrigin, type AgentCluster, type AgentCode } from "@/lib/api";

const cleanName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** An address a cluster can reach: http(s), no spaces or quotes. */
const cleanUrl = (value: string) => value.trim().replace(/\/+$/, "");
const validUrl = (value: string) => /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?(\/[A-Za-z0-9._~/-]*)?$/.test(value);
const isLocal = (value: string) => /^https?:\/\/(localhost|127\.|\[::1\])/.test(value);

const STATE: Record<AgentCluster["state"], { tone: string; label: string }> = {
  connected: { tone: "healthy", label: "Connected" },
  waiting: { tone: "info", label: "Waiting for the agent" },
  offline: { tone: "warning", label: "Disconnected" },
  revoked: { tone: "critical", label: "Revoked" },
};

function since(timestamp: string | null): string {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Every agent cluster with live status, polled while a panel shows it. */
function useAgentClusters(poll: boolean) {
  return useQuery({
    queryKey: ["agent-clusters"],
    queryFn: api.agentClusters,
    refetchInterval: poll ? 2000 : false,
  });
}

/** The install command: KubeiQ serves the manifest with the code and its address filled in. */
function InstallCommand({ code }: { code: AgentCode }) {
  const origin = apiOrigin();
  const [address, setAddress] = useState(origin);
  const [changes, setChanges] = useState(false);
  const url = cleanUrl(address);
  const params = new URLSearchParams({ code: code.code });
  if (url && url !== origin && validUrl(url)) params.set("url", url);
  if (changes) params.set("changes", "true");
  const manifest = `${origin}/api/v1/agent/install.yaml?${params.toString()}`;
  return (
    <div className="flex flex-col gap-3">
      <Terminal commands={[`kubectl apply -f "${manifest}"`]} />
      <p className="text-[13px] text-subtle">
        Run it once where kubectl reaches the cluster. It installs the agent in the kubeiq-agent
        namespace with read-only access (no Secrets). The agent connects out to KubeiQ; nothing in
        the cluster is opened. The code works once, until{" "}
        {new Date(code.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
      {code.note && <p className="text-[13px] text-warning">{code.note}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="KubeiQ address for the agent" hint="Where the cluster reaches KubeiQ over HTTPS">
          <input
            className={input}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            maxLength={200}
          />
        </Field>
        <label className="flex items-start gap-2 self-center text-sm text-muted">
          <input type="checkbox" className="mt-0.5" checked={changes} onChange={(e) => setChanges(e.target.checked)} />
          Also allow the changes Cluster Manager offers, when an admin turns them on
        </label>
      </div>
      {url && !validUrl(url) && <p className="text-[13px] text-danger">Use an http(s) address, such as https://kubeiq.example.com</p>}
      {isLocal(url) && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-fg">
          A cluster cannot reach KubeiQ at localhost. Enter an address it can reach
        </p>
      )}
    </div>
  );
}

/** Live state of one agent cluster. */
export function AgentStatus({ agent }: { agent: AgentCluster }) {
  const state = STATE[agent.state];
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-2 text-sm" aria-live="polite">
      <dt className="text-subtle">Agent</dt>
      <dd className="flex items-center gap-2">
        {agent.state === "waiting" ? <Spinner /> : <Dot tone={state.tone} />}
        {state.label}
      </dd>
      <dt className="text-subtle">Last seen</dt>
      <dd>{agent.state === "connected" ? "Now" : since(agent.last_seen_at)}</dd>
      {agent.agent_version && (
        <>
          <dt className="text-subtle">Agent version</dt>
          <dd>{agent.agent_version}</dd>
        </>
      )}
      {agent.kubernetes_version && (
        <>
          <dt className="text-subtle">Kubernetes</dt>
          <dd>{agent.kubernetes_version}</dd>
        </>
      )}
    </dl>
  );
}

/** Add a cluster through the agent: name it, run one command in the cluster, see it connect. */
export function AgentPanel({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const [projectId, setProjectId] = useState<string | null>(null);
  const project = projectId ?? projects.data?.[0]?.id ?? null;
  const create = useMutation({
    mutationFn: () => api.addAgentCluster(cleanName(name), project),
    onSuccess: () => {
      for (const key of [["clusters"], ["projects"], ["plan"], ["agent-clusters"]])
        queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const agents = useAgentClusters(Boolean(create.data));
  const agent = agents.data?.find((a) => a.name === create.data?.name);

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-bg p-4">
      <Step n={1} title="Name the Cluster">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name in KubeiQ" hint="Lowercase letters, numbers and dashes">
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="production"
              maxLength={40}
              disabled={Boolean(create.data)}
            />
          </Field>
          {(projects.data?.length ?? 0) > 1 && (
            <Field label="Project">
              <select
                className={input}
                value={project ?? ""}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={Boolean(create.data)}
              >
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {!create.data && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={!cleanName(name) || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Creating" : "Get Install Command"}
            </button>
            {create.error && <span className="text-sm text-danger">{(create.error as Error).message}</span>}
          </div>
        )}
      </Step>

      {create.data && (
        <Step n={2} title="Install the Agent">
          <InstallCommand code={create.data} />
        </Step>
      )}

      {create.data && (
        <Step n={3} title="Connected">
          {agent ? <AgentStatus agent={agent} /> : <Spinner />}
          {agent?.state === "connected" && (
            <button type="button" className={`${primaryButton} self-start`} onClick={onDone}>
              Done
            </button>
          )}
        </Step>
      )}
    </div>
  );
}

/** The Connection tab of an agent cluster: status, a new install command, revoke. */
export function AgentConnection({ name, onRemoved }: { name: string; onRemoved: () => void }) {
  const queryClient = useQueryClient();
  const agents = useAgentClusters(true);
  const agent = agents.data?.find((a) => a.name === name);
  const refresh = () => {
    for (const key of [["agent-clusters"], ["clusters"], ["cluster-status"]])
      queryClient.invalidateQueries({ queryKey: key });
  };
  const code = useMutation({ mutationFn: () => api.agentCode(name), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: () => api.revokeAgent(name), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => api.deleteAgentCluster(name),
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onRemoved();
    },
  });
  if (agents.error) return <p className="text-sm text-danger">{(agents.error as Error).message}</p>;
  if (!agent) return <Spinner />;
  const error = code.error ?? revoke.error ?? remove.error;

  return (
    <div className="flex flex-col gap-5 border-t border-border pt-5">
      <AgentStatus agent={agent} />
      {code.data ? (
        <InstallCommand code={code.data} />
      ) : (
        <p className="text-[13px] text-subtle">
          KubeiQ holds no credentials for this cluster: the agent uses its own read-only service
          account. To install it again, on a new cluster or after a revoke, get a new install command
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {!code.data && (
          <button type="button" className={secondaryButton} disabled={code.isPending} onClick={() => code.mutate()}>
            New Install Command
          </button>
        )}
        {agent.state !== "revoked" && agent.state !== "waiting" && (
          <button
            type="button"
            className={secondaryButton}
            disabled={revoke.isPending}
            onClick={() => {
              if (window.confirm(`Revoke the agent of ${name}? It disconnects now and its token stops working.`))
                revoke.mutate();
            }}
          >
            Revoke Agent
          </button>
        )}
        <button
          type="button"
          className="text-sm font-medium text-danger hover:underline"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Remove ${name} from KubeiQ? Its agent stops working. Remove the agent from the cluster with the uninstall command.`))
              remove.mutate();
          }}
        >
          Remove Cluster
        </button>
        {error && <span className="text-sm text-danger">{(error as Error).message}</span>}
      </div>
      <p className="text-[13px] text-subtle">
        Uninstall from the cluster:{" "}
        <span className="break-all font-mono text-xs">
          kubectl delete --ignore-not-found -f {apiOrigin()}/api/v1/agent/uninstall.yaml
        </span>
      </p>
    </div>
  );
}
