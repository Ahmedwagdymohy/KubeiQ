"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CheckIcon, ChevronDownIcon, PlusIcon } from "@/components/icons";
import { LabelList } from "@/components/settings/cluster-labels";
import { useMe } from "@/hooks/use-me";
import { useWorkspace } from "@/hooks/use-workspace";
import { api, type Cluster, type ClusterHealthState, type Gauge } from "@/lib/api";
import { byTone, clusterTone, TONE_DOT } from "@/lib/clusters";
import { resolveCluster, setClusterScope, useClusterScope } from "@/lib/scope";
import { bytes, cores, DEFAULT_THRESHOLDS, percent, USAGE_BAR, usageTone, type Thresholds } from "@/lib/usage";

const HEALTH: Record<ClusterHealthState, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "text-healthy" },
  degraded: { label: "Degraded", className: "text-warning" },
  unhealthy: { label: "Unhealthy", className: "text-danger" },
  "no-access": { label: "No access", className: "text-warning" },
  offline: { label: "Offline", className: "text-danger" },
};

/** The cluster in scope and the clusters in order (working first), shared by the shortcuts. */
export function useScopedClusters() {
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const id = resolveCluster(clusters.data, useClusterScope());
  const ordered = byTone(clusters.data ?? []);
  return { clusters, ordered, current: clusters.data?.find((c) => c.id === id) ?? null };
}

/**
 * A slim row under the top bar for the cluster in scope: the switcher, health that links to its
 * fix, version, nodes, namespaces and usage when metrics-server is there. Narrow screens keep the
 * switcher and health only.
 */
export function StatusBar() {
  const { current, ordered } = useScopedClusters();
  const admin = useMe().data?.role === "admin";
  const workspace = useWorkspace();
  const summary = useQuery({
    queryKey: ["cluster-summary", current?.id],
    queryFn: () => api.clusterSummary(current!.id),
    enabled: Boolean(current),
    refetchInterval: 30_000,
  });
  if (!current) return null;
  const s = summary.data;
  const health = s ? HEALTH[s.health] : null;
  const fixHref =
    s?.health === "no-access" || s?.health === "offline"
      ? admin
        ? "/settings#clusters"
        : null
      : s?.health === "degraded" || s?.health === "unhealthy"
        ? `/doctor?cluster=${encodeURIComponent(current.id)}`
        : null;

  return (
    <div className="flex h-10 shrink-0 items-center gap-4 border-b border-border px-3 text-[13px] sm:px-4">
      <ClusterSwitcher current={current} ordered={ordered} />
      {health &&
        (fixHref ? (
          <Link
            href={fixHref}
            title={s?.reason ?? undefined}
            className={`shrink-0 font-medium underline-offset-2 hover:underline ${health.className}`}
          >
            {health.label}
          </Link>
        ) : (
          <span title={s?.reason ?? undefined} className={`shrink-0 font-medium ${health.className}`}>
            {health.label}
          </span>
        ))}
      {!s && summary.isPending && <span className="h-3 w-16 rounded bg-surface-2" />}
      {s && (
        <div className="hidden min-w-0 items-center gap-4 text-muted md:flex">
          {s.version && <span className="shrink-0">Kubernetes {s.version}</span>}
          {s.nodes !== null && (
            <span className="shrink-0">
              {s.nodes_ready !== s.nodes ? `${s.nodes_ready} of ${s.nodes} nodes ready` : plural(s.nodes, "node")}
            </span>
          )}
          {s.namespaces !== null && <span className="hidden shrink-0 lg:inline">{plural(s.namespaces, "namespace")}</span>}
          {s.pods !== null && s.pods_running !== null && (
            <span className="hidden shrink-0 xl:inline">
              {s.pods_running} of {plural(s.pods, "pod")} running
            </span>
          )}
        </div>
      )}
      {s?.cpu && s.memory && current.settings?.metrics !== false && workspace.show_usage && (
        <div className="ml-auto hidden items-center gap-4 lg:flex">
          <UsageBar
            label="CPU"
            gauge={s.cpu}
            detail={`${cores(s.cpu.used)} of ${cores(s.cpu.capacity)} cores`}
            thresholds={current.settings?.cpu}
          />
          <UsageBar
            label="Memory"
            gauge={s.memory}
            detail={`${bytes(s.memory.used)} of ${bytes(s.memory.capacity)}`}
            thresholds={current.settings?.memory}
          />
        </div>
      )}
    </div>
  );
}

function plural(n: number, word: string) {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

export function UsageBar({
  label,
  gauge,
  detail,
  thresholds = DEFAULT_THRESHOLDS,
}: {
  label: string;
  gauge: Gauge;
  detail: string;
  thresholds?: Thresholds;
}) {
  const value = percent(gauge);
  return (
    <span className="flex items-center gap-2" title={`${label}: ${detail}`}>
      <span className="text-subtle">{label}</span>
      <span
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2"
      >
        <span className={`block h-full rounded-full ${USAGE_BAR[usageTone(value, thresholds)]}`} style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className="w-9 tabular-nums text-muted">{Math.round(value)}%</span>
    </span>
  );
}

const REASON: Record<string, string> = {
  checking: "Checking",
  "no-access": "No access",
  offline: "Offline",
};

/** Every cluster with its status and version; broken ones last with why; Add a cluster. */
export function ClusterSwitcher({
  current,
  ordered,
  wide = false,
}: {
  current: Cluster;
  ordered: Cluster[];
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const admin = useMe().data?.role === "admin";

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const tone = clusterTone(current);
  return (
    <div ref={ref} className={`relative ${wide ? "w-full" : "min-w-0"}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 min-w-0 items-center gap-2 rounded-md px-2 transition-colors hover:bg-surface-2 ${
          wide ? "h-11 w-full border border-control" : "-ml-2 max-w-[420px]"
        }`}
      >
        <span className="sr-only">Cluster:</span>
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
        <span className="truncate font-mono text-[13px] font-medium text-fg">{current.name}</span>
        {!wide && (
          <span className="hidden xl:flex">
            <LabelList labels={current.labels} max={2} />
          </span>
        )}
        <ChevronDownIcon width={14} height={14} className="shrink-0 text-subtle" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 flex w-[320px] max-w-[calc(100vw-24px)] flex-col rounded-lg border border-border bg-bg p-1 text-sm shadow-lg shadow-black/10">
          <ul role="listbox" aria-label="Clusters" className="flex max-h-[60vh] flex-col overflow-y-auto">
            {ordered.map((c, i) => {
              const t = clusterTone(c);
              const selected = c.id === current.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setClusterScope(c.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[t]}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-[13px] text-fg">{c.name}</span>
                        <LabelList labels={c.labels} max={2} />
                      </span>
                      <span className={`truncate text-xs ${t === "ok" ? "text-subtle" : t === "offline" ? "text-danger" : "text-warning"}`}>
                        {t === "ok" ? `Kubernetes ${c.status?.version ?? ""}` : (c.status?.error ?? REASON[t])}
                      </span>
                    </span>
                    {selected ? (
                      <CheckIcon width={14} height={14} className="shrink-0 text-accent" />
                    ) : (
                      i < 9 && <kbd className="shrink-0 font-sans text-[11px] text-subtle">Ctrl {i + 1}</kbd>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {admin && (
            <Link
              href="/settings#clusters"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2 border-t border-border px-2.5 pb-1.5 pt-2.5 text-muted transition-colors hover:text-fg"
            >
              <PlusIcon width={14} height={14} />
              Add a cluster
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
