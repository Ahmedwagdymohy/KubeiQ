"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { openAssistant } from "@/components/assistant/assistant-panel";
import { timeAgo } from "@/components/doctor/history-list";
import { CloseIcon, SparkleIcon } from "@/components/icons";
import { KindIcon } from "@/components/manager/kind-icons";
import { NamespacePicker } from "@/components/manager/namespace-picker";
import { useScopedClusters } from "@/components/shell/status-bar";
import { useLiveList } from "@/hooks/use-live-list";
import { useAllNamespaces } from "@/hooks/use-me";
import { api, watchUrl, type KindInfo, type TimelineItem } from "@/lib/api";
import { findResource } from "@/lib/navigation";

const EVENTS: KindInfo = { group: "", version: "v1", resource: "events", kind: "Event", label: "Events", namespaced: true, verbs: ["list", "watch"] };
const KINDS: Record<string, string> = {
  Pod: "core/v1/pods",
  Deployment: "apps/v1/deployments",
  StatefulSet: "apps/v1/statefulsets",
  DaemonSet: "apps/v1/daemonsets",
  ReplicaSet: "apps/v1/replicasets",
  Job: "batch/v1/jobs",
  CronJob: "batch/v1/cronjobs",
  Service: "core/v1/services",
  Node: "core/v1/nodes",
  PersistentVolumeClaim: "core/v1/persistentvolumeclaims",
  HorizontalPodAutoscaler: "autoscaling/v2/horizontalpodautoscalers",
  Ingress: "networking.k8s.io/v1/ingresses",
};

type Filter = { type: "all" | "Warning" | "Normal"; source: "all" | "kubernetes" | "kubeiq"; text: string };

function objectHref(cluster: string, item: TimelineItem): string | null {
  if (item.link) return item.link;
  const kind = item.kind ? KINDS[item.kind] : null;
  if (!kind || !item.name) return null;
  const q = new URLSearchParams({ cluster, kind, name: item.name });
  if (item.namespace) {
    q.set("in", item.namespace);
    q.set("namespace", item.namespace);
  }
  return `/manager?${q}`;
}

export function explainEvent(item: TimelineItem) {
  const what = item.kind && item.name ? `${item.kind} ${item.namespace ? `${item.namespace}/` : ""}${item.name}` : "the cluster";
  openAssistant(`Explain this warning on ${what}: ${item.reason}: ${item.message}. What causes it and how do I fix it?`);
}

/**
 * What happened in the cluster: Kubernetes events (live) and KubeiQ's own entries (investigations,
 * changes, connections), newest first, with filters and Explain on warnings.
 */
export function Timeline() {
  const { current } = useScopedClusters();
  const cluster = current?.id ?? null;
  const [namespace, setNamespace] = useState("");
  const [filter, setFilter] = useState<Filter>({ type: "all", source: "all", text: "" });
  const [open, setOpen] = useState<TimelineItem | null>(null);
  const allNamespaces = useAllNamespaces(cluster);
  const namespaces = useQuery({ queryKey: ["namespaces", cluster], queryFn: () => api.namespaces(cluster!), enabled: Boolean(cluster) });
  const key = ["timeline", cluster, namespace];
  const live = useLiveList(cluster ? watchUrl(cluster, EVENTS, namespace || null) : null, key);
  const feed = useQuery({
    queryKey: key,
    queryFn: () => api.timeline(cluster!, namespace || null),
    enabled: Boolean(cluster),
    refetchInterval: live ? 30_000 : 10_000,
    placeholderData: keepPreviousData,
  });
  const q = filter.text.trim().toLowerCase();
  const items = useMemo(
    () =>
      (feed.data ?? []).filter(
        (i) =>
          (filter.type === "all" || i.type === filter.type) &&
          (filter.source === "all" || i.source === filter.source) &&
          (!q || `${i.reason} ${i.message} ${i.name ?? ""} ${i.namespace ?? ""}`.toLowerCase().includes(q)),
      ),
    [feed.data, filter, q],
  );
  const warnings = (feed.data ?? []).filter((i) => i.type === "Warning").length;
  const filtered = filter.type !== "all" || filter.source !== "all" || q !== "";

  const segment = <T extends string>(value: T, options: [T, string][], onChange: (v: T) => void, label: string) => (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-control p-0.5">
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`h-7 rounded-md px-2.5 text-sm ${value === id ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
            {feed.data && (
              <span className={`text-sm ${warnings ? "text-warning" : "text-muted"}`}>
                {warnings} {warnings === 1 ? "warning" : "warnings"}
              </span>
            )}
            {live && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-healthy" />
                Live
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {segment(filter.type, [["all", "All"], ["Warning", "Warnings"], ["Normal", "Normal"]], (type) => setFilter({ ...filter, type }), "Type")}
            {segment(filter.source, [["all", "All sources"], ["kubernetes", "Kubernetes"], ["kubeiq", "KubeiQ"]], (source) => setFilter({ ...filter, source }), "Source")}
            <NamespacePicker value={namespace} namespaces={namespaces.data ?? []} allowAll={allNamespaces} onChange={setNamespace} />
            <input
              type="search"
              value={filter.text}
              onChange={(e) => setFilter({ ...filter, text: e.target.value })}
              placeholder="Search events"
              aria-label="Search events"
              className="h-8 w-56 rounded-lg border border-control bg-bg px-2.5 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {feed.isPending && cluster && <p className="p-6 text-sm text-muted">Loading events</p>}
          {feed.error && <p className="p-6 text-sm text-danger">{feed.error.message}</p>}
          {feed.data && items.length === 0 && (
            <div className="flex flex-col items-start gap-2 p-6 text-sm text-muted">
              {filtered ? "Nothing matches these filters" : "No events yet"}
              {filtered && (
                <button type="button" onClick={() => setFilter({ type: "all", source: "all", text: "" })} className="font-medium text-accent hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          )}
          <ul className="flex flex-col">
            {items.map((item) => (
              <Row key={item.id} item={item} cluster={cluster ?? ""} active={open?.id === item.id} onOpen={() => setOpen(item)} />
            ))}
          </ul>
        </div>
      </div>
      {open && cluster && <Details item={open} cluster={cluster} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Row({ item, cluster, active, onOpen }: { item: TimelineItem; cluster: string; active: boolean; onOpen: () => void }) {
  const href = objectHref(cluster, item);
  const resource = item.kind ? findResource(KINDS[item.kind] ?? null)?.item.resource : undefined;
  return (
    <li className={`group flex gap-3 border-b border-border/70 px-4 py-3 transition-colors sm:px-6 ${active ? "bg-surface-2" : "hover:bg-surface"}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.type === "Warning" ? "bg-warning" : item.source === "kubeiq" ? "bg-accent" : "bg-subtle"}`} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className={`font-medium ${item.type === "Warning" ? "text-warning" : ""}`}>{item.reason}</span>
          {item.kind && item.name && (
            <span className="flex min-w-0 items-center gap-1 truncate font-mono text-xs text-subtle">
              {resource && <KindIcon resource={resource} width={12} height={12} />}
              {item.kind}/{item.namespace ? `${item.namespace}/` : ""}
              {item.name}
            </span>
          )}
          {item.count > 1 && <span className="text-xs text-subtle">×{item.count}</span>}
        </span>
        <span className="line-clamp-2 text-sm text-muted">{item.message}</span>
        <span className="text-xs text-subtle">
          {item.source === "kubeiq" ? "KubeiQ · " : ""}
          {item.component ?? ""}
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs tabular-nums text-subtle">{item.last_seen ? timeAgo(item.last_seen) : ""}</span>
        <span className="flex items-center gap-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          {item.type === "Warning" && item.source === "kubernetes" && (
            <button type="button" onClick={() => explainEvent(item)} className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              <SparkleIcon width={13} height={13} />
              Explain
            </button>
          )}
          {href && (
            <Link href={href} className="text-sm text-muted hover:text-fg">
              Open
            </Link>
          )}
        </span>
      </div>
    </li>
  );
}

function Details({ item, cluster, onClose }: { item: TimelineItem; cluster: string; onClose: () => void }) {
  const href = objectHref(cluster, item);
  const rows: [string, string | null][] = [
    ["Type", item.type],
    ["Source", item.source === "kubeiq" ? `KubeiQ, ${item.component ?? ""}` : (item.component ?? "Kubernetes")],
    ["Object", item.kind && item.name ? `${item.kind}/${item.name}` : null],
    ["Namespace", item.namespace],
    ["Count", String(item.count)],
    ["First seen", item.first_seen ? new Date(item.first_seen).toLocaleString() : null],
    ["Last seen", item.last_seen ? new Date(item.last_seen).toLocaleString() : null],
  ];
  return (
    <aside className="hidden w-[400px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-6 lg:flex">
      <div className="flex items-start gap-3">
        <h2 className="flex-1 font-semibold">{item.reason}</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-fg">
          <CloseIcon />
        </button>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{item.message}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-subtle">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {item.type === "Warning" && item.source === "kubernetes" && (
          <button type="button" onClick={() => explainEvent(item)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-ink hover:bg-accent-strong">
            <SparkleIcon width={14} height={14} />
            Explain
          </button>
        )}
        {href && (
          <Link href={href} className="inline-flex h-9 items-center rounded-lg border border-control px-3.5 text-sm font-medium hover:bg-surface">
            {item.link ? "Open investigation" : "Open object"}
          </Link>
        )}
      </div>
    </aside>
  );
}
