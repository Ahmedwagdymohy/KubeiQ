"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CloseIcon } from "@/components/icons";
import { Section } from "@/components/settings/fields";
import { api, type AuditEvent } from "@/lib/api";

const ACTIONS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.password": "Changed their password",
  "user.create": "Added user",
  "user.invite": "Invited",
  "user.update": "Updated user",
  "user.delete": "Removed user",
  "project.create": "Added project",
  "project.update": "Updated project",
  "project.delete": "Deleted project",
  "settings.ai": "Changed the AI model",
  "settings.kubeconfig.add": "Added kubeconfig",
  "settings.kubeconfig.delete": "Removed a kubeconfig",
  "settings.kubeconfig.connect": "Connected a cluster",
  "settings.cluster.add": "Connected a cluster",
  "settings.cluster.edit": "Edited a cluster",
  "settings.cluster.remove": "Removed a cluster",
  "settings.changes": "Changed cluster change settings",
  "settings.general": "Changed general settings",
  "settings.notifications.channel": "Saved notification channel",
  "settings.notifications.channel.delete": "Removed a notification channel",
  "settings.notifications.rules": "Changed alert rules",
  "settings.cluster.alerts": "Changed a cluster's alerts",
  "settings.cluster.hide": "Hid a cluster",
  "settings.cluster.show": "Unhid a cluster",
  "settings.activity.clear": "Cleared the activity log",
  "settings.clusters.remove-all": "Removed all clusters",
  "settings.reset": "Reset the workspace",
  "settings.google": "Changed Google sign-in",
  "settings.gke": "Changed Google Cloud projects",
  "k8s.scale": "Scaled",
  "k8s.restart": "Restarted",
  "k8s.delete": "Deleted",
  "k8s.cordon": "Cordoned",
  "k8s.uncordon": "Uncordoned",
  "k8s.drain": "Drained",
  "k8s.trigger": "Ran",
  "k8s.suspend": "Suspended",
  "k8s.resume": "Resumed",
  "k8s.edit": "Edited",
  "k8s.create": "Created",
  "k8s.exec": "Opened a terminal in",
  "k8s.download": "Downloaded",
};

const GROUPS: [string, string][] = [
  ["", "All actions"],
  ["auth.", "Sign-ins"],
  ["k8s.", "Cluster changes"],
  ["k8s.exec", "Terminals"],
  ["settings.", "Settings"],
  ["user.", "Users"],
  ["project.", "Projects"],
];
const PAGE = 25;

function tone(e: AuditEvent): string {
  if (!e.ok) return "text-danger bg-danger/10";
  if (e.action === "k8s.delete" || e.action.startsWith("settings.reset") || e.action.endsWith(".remove-all")) return "text-danger bg-danger/10";
  if (e.action.startsWith("k8s.")) return "text-warning bg-warning/10";
  if (e.action.startsWith("auth.")) return "text-muted bg-surface-2";
  return "text-accent bg-accent/10";
}

function describe(event: AuditEvent) {
  if (event.action === "auth.login" && !event.ok) return "Failed sign-in";
  if (event.action === "settings.changes") return `Turned cluster changes ${event.detail}`;
  return ACTIONS[event.action] ?? event.action;
}

/** Settings › Activity: who did what, filterable, paged, with details. Refreshes on its own. */
export function ActivitySection() {
  const [action, setAction] = useState("");
  const [username, setUsername] = useState("");
  const [cluster, setCluster] = useState("");
  const [text, setText] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const clusters = useQuery({ queryKey: ["clusters", "connected"], queryFn: api.connectedClusters });
  const search = useQuery({
    queryKey: ["audit", action, username, cluster, text, page],
    queryFn: () => api.searchAudit({ action: action || undefined, username: username || undefined, cluster_id: cluster || undefined, q: text || undefined, offset: page * PAGE, limit: PAGE }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
  const total = search.data?.total ?? 0;
  const from = total ? page * PAGE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE);
  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };
  const control = "h-8 rounded-lg border border-control bg-bg px-2 text-sm outline-none focus:border-accent";

  return (
    <Section id="activity" title="Activity" description="Sign-ins, settings and access changes, and every change made to a cluster, newest first">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <select aria-label="Action" value={action} onChange={(e) => reset(() => setAction(e.target.value))} className={control}>
            {GROUPS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select aria-label="User" value={username} onChange={(e) => reset(() => setUsername(e.target.value))} className={control}>
            <option value="">Everyone</option>
            {users.data?.users.map((u) => (
              <option key={u.id} value={u.username}>
                {u.username}
              </option>
            ))}
          </select>
          <select aria-label="Cluster" value={cluster} onChange={(e) => reset(() => setCluster(e.target.value))} className={control}>
            <option value="">All clusters</option>
            {clusters.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={text}
            onChange={(e) => reset(() => setText(e.target.value))}
            placeholder="Search target or detail"
            aria-label="Search activity"
            className={`${control} w-56 px-2.5`}
          />
        </div>
        {search.error && <p className="text-sm text-danger">{(search.error as Error).message}</p>}
        <div className="flex gap-4">
          <ul className="flex min-w-0 flex-1 flex-col divide-y divide-border/70 rounded-lg border border-border bg-bg">
            {search.data?.items.length === 0 && <li className="px-4 py-6 text-sm text-muted">Nothing matches</li>}
            {search.data?.items.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpen(e)}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-left text-sm transition-colors ${open?.id === e.id ? "bg-surface-2" : "hover:bg-surface"}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone(e)}`}>{describe(e)}</span>
                    <span className="truncate font-mono text-[13px]">{e.target ?? ""}</span>
                  </span>
                  <span className="text-xs tabular-nums text-subtle">{new Date(e.created_at).toLocaleString()}</span>
                  <span className="truncate text-xs text-muted">
                    {e.username}
                    {e.cluster_id ? ` · ${e.cluster_id.split(":").pop()}` : ""}
                    {e.namespace ? `/${e.namespace}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {open && (
            <aside className="hidden w-72 shrink-0 flex-col gap-3 rounded-lg border border-border bg-bg p-4 text-sm xl:flex">
              <div className="flex items-start gap-2">
                <span className="flex-1 font-medium">{describe(open)}</span>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close details" className="text-subtle hover:text-fg">
                  <CloseIcon width={16} height={16} />
                </button>
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
                {(
                  [
                    ["When", new Date(open.created_at).toLocaleString()],
                    ["Who", open.username],
                    ["Action", open.action],
                    ["Target", open.target],
                    ["Cluster", open.cluster_id],
                    ["Namespace", open.namespace],
                    ["Result", open.ok ? "Succeeded" : "Failed"],
                    ["Detail", open.detail],
                  ] as [string, string | null][]
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-subtle">{k}</dt>
                      <dd className={`break-words ${k === "Result" && !open.ok ? "text-danger" : ""}`}>{v}</dd>
                    </div>
                  ))}
              </dl>
            </aside>
          )}
        </div>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{total ? `Showing ${from} to ${to} of ${total}` : ""}</span>
          <span className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border border-control px-3 py-1 disabled:opacity-40">
              Previous
            </button>
            <button type="button" disabled={to >= total} onClick={() => setPage(page + 1)} className="rounded-lg border border-control px-3 py-1 disabled:opacity-40">
              Next
            </button>
          </span>
        </div>
      </div>
    </Section>
  );
}
